import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserProvider, Contract, JsonRpcProvider } from 'ethers'
import './App.css'
import ABI from './abi.json'
import {
  CONTRACT_ADDRESS,
  ETHERSCAN_TX_BASE_URL,
  EXPECTED_CHAIN_ID,
  EXPECTED_NETWORK_NAME,
  RPC_URL,
} from './config'

const CANDIDATE_NAMES = ['Léon Blum', 'Jacques Chirac', 'François Mitterrand']

function shortAddr(addr) {
  if (!addr || typeof addr !== 'string') return ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatCooldown(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function clampPct(n) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

async function copyToClipboard(text) {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

async function ensureSepoliaInMetaMask() {
  if (!window?.ethereum?.request) return { ok: false, reason: 'no_metamask' }
  const chainIdHex = `0x${EXPECTED_CHAIN_ID.toString(16)}`
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })
    return { ok: true }
  } catch (e) {
    if (e?.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: chainIdHex,
              chainName: EXPECTED_NETWORK_NAME,
              nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: ['https://sepolia.etherscan.io'],
            },
          ],
        })
        return { ok: true }
      } catch (e2) {
        return { ok: false, reason: 'add_rejected', error: e2 }
      }
    }
    return { ok: false, reason: 'switch_rejected', error: e }
  }
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system')
  const [account, setAccount] = useState(null)
  const [provider, setProvider] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [error, setError] = useState(null)
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true)

  const [isVoting, setIsVoting] = useState(false)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  const [txHash, setTxHash] = useState(null)
  const [lastBlockNumber, setLastBlockNumber] = useState(null)
  const [txStep, setTxStep] = useState(null)
  const [txError, setTxError] = useState(null)

  const [lastEvent, setLastEvent] = useState(null)

  const [explorerEvents, setExplorerEvents] = useState([])
  const [explorerOpen, setExplorerOpen] = useState(false)
  const [explorerLoading, setExplorerLoading] = useState(false)

  const [hasMetaMask, setHasMetaMask] = useState(false)
  const [balanceEth, setBalanceEth] = useState(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [toast, setToast] = useState(null)

  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockModalLoading, setBlockModalLoading] = useState(false)
  const [blockDetails, setBlockDetails] = useState(null)

  const listenCleanupRef = useRef(null)

  const readProvider = useMemo(() => {
    if (provider) return provider
    if (typeof window !== 'undefined' && window.ethereum) return new BrowserProvider(window.ethereum)
    return new JsonRpcProvider(RPC_URL)
  }, [provider])

  const loadCandidates = async (_provider) => {
    const p = _provider ?? readProvider
    setIsLoadingCandidates(true)
    try {
      const contrat = new Contract(CONTRACT_ADDRESS, ABI, p)
      const count = await contrat.getCandidatesCount()
      const list = []
      for (let i = 0; i < Number(count); i++) {
        const [name, voteCount] = await contrat.getCandidate(i)
        list.push({ id: i, name, votes: Number(voteCount) })
      }
      setCandidates(list)
    } finally {
      setIsLoadingCandidates(false)
    }
  }

  const refreshCooldownFromChain = async (_provider, _account) => {
    if (!_provider || !_account) return
    try {
      const contrat = new Contract(CONTRACT_ADDRESS, ABI, _provider)
      const secondsLeft = Number(await contrat.getTimeUntilNextVote(_account))
      setCooldownSeconds(Math.max(0, secondsLeft))
    } catch {
    }
  }

  const refreshBalance = async (_provider, _account) => {
    if (!_provider || !_account) return
    setBalanceLoading(true)
    try {
      const b = await _provider.getBalance(_account)
      const wei = BigInt(b.toString())
      const ethInt = wei / 10n ** 18n
      const ethFrac = (wei % 10n ** 18n) / 10n ** 14n
      setBalanceEth(`${ethInt}.${String(ethFrac).padStart(4, '0')}`)
    } catch {
      setBalanceEth(null)
    } finally {
      setBalanceLoading(false)
    }
  }

  const totalVotes = useMemo(() => candidates.reduce((acc, c) => acc + (Number(c.votes) || 0), 0), [
    candidates,
  ])

  const showToast = (message) => setToast(message)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
      localStorage.removeItem('theme')
    } else {
      root.setAttribute('data-theme', theme)
      localStorage.setItem('theme', theme)
    }
  }, [theme])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const openBlockModal = async (blockNumber) => {
    if (!blockNumber) return
    setBlockModalOpen(true)
    setBlockModalLoading(true)
    setBlockDetails(null)
    try {
      const b = await readProvider.getBlock(blockNumber)
      if (!b) {
        setBlockDetails({ blockNumber, notFound: true })
        return
      }
      setBlockDetails({
        blockNumber: b.number,
        timestamp: b.timestamp ?? null,
        parentHash: b.parentHash ?? null,
        hash: b.hash ?? null,
        gasLimit: b.gasLimit != null ? b.gasLimit.toString() : null,
        gasUsed: b.gasUsed != null ? b.gasUsed.toString() : null,
        miner: b.miner ?? null,
      })
    } catch {
      setBlockDetails({ blockNumber, error: true })
    } finally {
      setBlockModalLoading(false)
    }
  }

  const gotoBlock = async (delta) => {
    const n = blockDetails?.blockNumber
    if (!n || !Number.isFinite(n)) return
    await openBlockModal(n + delta)
  }

  useEffect(() => {
    setHasMetaMask(Boolean(window?.ethereum))
    let cancelled = false
    const init = async () => {
      try {
        await loadCandidates(readProvider)
      } catch (e) {
        if (cancelled) return
        setError("Impossible de lire le contrat (provider indisponible).")
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  const connectWallet = async () => {
    try {
      setError(null)
      setTxHash(null)
      setLastBlockNumber(null)
      setTxStep(null)

      if (!window.ethereum) {
        setError("MetaMask n'est pas installé.")
        return
      }

      const ensured = await ensureSepoliaInMetaMask()
      if (!ensured.ok && ensured.reason !== 'no_metamask') {
        setError(`Impossible de basculer MetaMask sur ${EXPECTED_NETWORK_NAME}.`)
        return
      }

      const _provider = new BrowserProvider(window.ethereum)
      await _provider.send('eth_requestAccounts', [])
      const network = await _provider.getNetwork()
      if (network.chainId !== BigInt(EXPECTED_CHAIN_ID)) {
        setError(`Mauvais réseau — connectez MetaMask sur ${EXPECTED_NETWORK_NAME}.`)
        return
      }

      const signer = await _provider.getSigner()
      const address = await signer.getAddress()
      setAccount(address)
      setProvider(_provider)
      await loadCandidates(_provider)
      await refreshCooldownFromChain(_provider, address)
      await refreshBalance(_provider, address)
    } catch (e) {
      setError(e?.code === 4001 ? 'Connexion refusée.' : 'Connexion impossible.')
    }
  }

  const vote = async (candidateIndex) => {
    if (!provider || !account) return
    try {
      setIsVoting(true)
      setError(null)
      setTxError(null)
      setTxHash(null)
      setLastBlockNumber(null)
      setTxStep('signature')

      const signer = await provider.getSigner()
      const voteContract = new Contract(CONTRACT_ADDRESS, ABI, signer)

      const secondsLeft = Number(await voteContract.getTimeUntilNextVote(account))
      if (secondsLeft > 0) {
        setCooldownSeconds(secondsLeft)
        setTxStep(null)
        return
      }

      const tx = await voteContract.vote(candidateIndex)
      setTxHash(tx.hash)
      setTxStep('envoi')

      const receipt = await tx.wait()
      setLastBlockNumber(receipt.blockNumber)
      setTxStep('confirmation')

      await loadCandidates(provider)
      await refreshCooldownFromChain(provider, account)
      await refreshBalance(provider, account)
    } catch (err) {
      setTxStep(null)
      const msg =
        err?.code === 4001 ? 'Transaction annulée.' : `Erreur : ${err?.message ?? 'inconnue'}`
      setTxError(msg)
    } finally {
      setIsVoting(false)
    }
  }

  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownSeconds])

  useEffect(() => {
    if (!readProvider) return

    if (listenCleanupRef.current) {
      listenCleanupRef.current()
      listenCleanupRef.current = null
    }

    let listenContract
    try {
      listenContract = new Contract(CONTRACT_ADDRESS, ABI, readProvider)
      const handler = (voter, candidateIndex) => {
        const idx = Number(candidateIndex)
        setLastEvent({
          voter: shortAddr(voter),
          candidateName: CANDIDATE_NAMES[idx] ?? `Candidat #${idx}`,
        })
        loadCandidates(readProvider)
        if (account) refreshCooldownFromChain(readProvider, account)
      }

      listenContract.on('Voted', handler)
      const cleanup = () => {
        try {
          listenContract.off('Voted', handler)
        } catch {
        }
      }
      listenCleanupRef.current = cleanup
      return cleanup
    } catch {
    }
  }, [readProvider, account])

  useEffect(() => {
    if (!window.ethereum) return
    const onAccountsChanged = (accounts) => {
      const next = accounts?.[0] ?? null
      setAccount(next)
      setError(null)
      setTxHash(null)
      setLastBlockNumber(null)
      setTxStep(null)
      if (provider && next) {
        refreshCooldownFromChain(provider, next)
        refreshBalance(provider, next)
      } else {
        setBalanceEth(null)
      }
    }
    const onChainChanged = () => {
      setError('Réseau changé dans MetaMask — reconnecte-toi.')
      setAccount(null)
      setProvider(null)
      setTxHash(null)
      setLastBlockNumber(null)
      setTxStep(null)
      setCooldownSeconds(0)
      setBalanceEth(null)
    }

    window.ethereum.on?.('accountsChanged', onAccountsChanged)
    window.ethereum.on?.('chainChanged', onChainChanged)
    return () => {
      window.ethereum.removeListener?.('accountsChanged', onAccountsChanged)
      window.ethereum.removeListener?.('chainChanged', onChainChanged)
    }
  }, [provider])

  const loadExplorerEvents = async () => {
    setExplorerLoading(true)
    try {
      const ec = new Contract(CONTRACT_ADDRESS, ABI, readProvider)
      const raw = await ec.queryFilter(ec.filters.Voted(), -1000)
      const last20 = raw.slice(-20).reverse()
      const enriched = await Promise.all(
        last20.map(async (e) => {
          const idx = Number(e.args.candidateIndex)
          let timestamp = null
          let gasUsed = null
          try {
            const block = await readProvider.getBlock(e.blockNumber)
            timestamp = block?.timestamp ?? null
          } catch {
          }
          try {
            const receipt = await readProvider.getTransactionReceipt(e.transactionHash)
            gasUsed = receipt?.gasUsed != null ? Number(receipt.gasUsed) : null
          } catch {
          }
          return {
            hash: e.transactionHash,
            blockNumber: e.blockNumber,
            voter: e.args.voter,
            candidateName: CANDIDATE_NAMES[idx] ?? `Candidat #${idx}`,
            timestamp,
            gasUsed,
          }
        }),
      )
      setExplorerEvents(enriched)
    } catch {
      setExplorerEvents([])
    } finally {
      setExplorerLoading(false)
    }
  }

  useEffect(() => {
    if (explorerOpen) loadExplorerEvents()
  }, [explorerOpen])

  return (
    <div className="page">
      <header className="header">
        <div className="title">
          <div className="kicker">Live on Ethereum</div>
          <h1>Scrutin présidentiel - Sepolia</h1>
          <p className="subtitle">
            Contrat Sepolia partagé · lecture publique · vote via transaction signée
          </p>
        </div>

        <div className="wallet">
          <div className="themeToggle" role="group" aria-label="Thème">
            <button
              className={`chipBtn ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
              type="button"
            >
              Clair
            </button>
            <button
              className={`chipBtn ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
              type="button"
            >
              Sombre
            </button>
            <button
              className={`chipBtn ${theme === 'system' ? 'active' : ''}`}
              onClick={() => setTheme('system')}
              type="button"
            >
              Système
            </button>
          </div>

          {!account ? (
            <button className="btn" onClick={connectWallet} disabled={!hasMetaMask}>
              Connecter MetaMask
            </button>
          ) : (
            <div className="walletInfo">
              <div className="pill">
                <span className="dot" aria-hidden="true" />
                <strong>{shortAddr(account)}</strong>
                <span className="muted">· {EXPECTED_NETWORK_NAME}</span>
                <button
                  className="iconBtn"
                  onClick={async () => {
                    const ok = await copyToClipboard(account)
                    showToast(ok ? 'Adresse copiée' : 'Copie impossible')
                  }}
                  title="Copier l'adresse"
                >
                  Copier
                </button>
              </div>
              <div className="walletMeta">
                <span className="muted small">Solde</span>{' '}
                <strong className="mono">
                  {balanceLoading ? '...' : balanceEth != null ? `${balanceEth} ETH` : '-'}
                </strong>
              </div>
            </div>
          )}
          {!hasMetaMask && (
            <p className="muted small">
              MetaMask non détecté (lecture seule active).
            </p>
          )}
        </div>
      </header>

      {error && <div className="alert">{error}</div>}

      <section className="card metaCard">
        <div className="metaTop">
          <div>
            <h2>Smart Contract (Sepolia)</h2>
            <div className="muted small mono">{CONTRACT_ADDRESS}</div>
          </div>
          <div className="metaLinks">
            <a
              className="chipLink"
              href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Voir le contrat
            </a>
            <a
              className="chipLink"
              href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}#transactions`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Transactions
            </a>
            <a
              className="chipLink"
              href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}#events`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Events
            </a>
            <button
              className="iconBtn"
              onClick={async () => {
                const ok = await copyToClipboard(CONTRACT_ADDRESS)
                showToast(ok ? 'Adresse du contrat copiée' : 'Copie impossible')
              }}
              title="Copier l'adresse du contrat"
            >
              Copier
            </button>
          </div>
        </div>
      </section>

      {lastEvent && (
        <div className="event">
          Nouveau vote — <strong>{lastEvent.voter}</strong> a voté pour{' '}
          <strong>{lastEvent.candidateName}</strong>
        </div>
      )}

      <main className="grid">
        <section className="card">
          <div className="cardHeader">
            <h2>Résultats</h2>
            <button className="btn btnSecondary" onClick={() => loadCandidates(readProvider)}>
              Rafraîchir
            </button>
          </div>

          <div className="list">
            {isLoadingCandidates ? (
              <div className="muted">Chargement des résultats...</div>
            ) : candidates.length === 0 ? (
              <div className="muted">Aucun candidat trouvé.</div>
            ) : (
              candidates.map((c) => (
              <div key={c.id} className="row">
                <div className="rowLeft">
                  <div className="name">{c.name}</div>
                  <div className="muted">
                    {c.votes} vote(s) ·{' '}
                    <strong className="mono">
                      {clampPct(totalVotes > 0 ? (c.votes / totalVotes) * 100 : 0).toFixed(1)}%
                    </strong>
                  </div>
                  <div className="bar" aria-hidden="true">
                    <div
                      className="barFill"
                      style={{
                        width: `${clampPct(totalVotes > 0 ? (c.votes / totalVotes) * 100 : 0)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="rowRight">
                  {account && cooldownSeconds === 0 ? (
                    <button className="btn" onClick={() => vote(c.id)} disabled={isVoting}>
                      {isVoting ? 'En cours...' : 'Voter'}
                    </button>
                  ) : (
                    <button className="btn btnDisabled" disabled>
                      {account ? 'Indisponible' : 'Connecte-toi'}
                    </button>
                  )}
                </div>
              </div>
              ))
            )}
          </div>

          {account && cooldownSeconds > 0 && (
            <div className="cooldown">
              <div className="muted">Prochain vote disponible dans</div>
              <div className="timer">{formatCooldown(cooldownSeconds)}</div>
              <div className="muted small">
                Le smart contract applique le cooldown via <code>block.timestamp</code>.
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <div className="cardHeader">
            <h2>Transaction</h2>
          </div>

          <div className="tx">
            <div className="stepper" aria-label="Étapes de transaction">
              <div className={`step ${txStep === 'signature' ? 'active' : txStep ? 'done' : ''}`}>
                1 · Signature
              </div>
              <div className={`step ${txStep === 'envoi' ? 'active' : txStep === 'confirmation' ? 'done' : ''}`}>
                2 · Envoi
              </div>
              <div className={`step ${txStep === 'confirmation' ? 'active' : ''}`}>
                3 · Confirmée
              </div>
            </div>

            <div className="txLine">
              <span className="muted">Statut</span>
              <span>
                {!txStep
                  ? '—'
                  : txStep === 'signature'
                    ? 'Signature (MetaMask)...'
                    : txStep === 'envoi'
                      ? 'Envoi...'
                      : 'Confirmée'}
              </span>
            </div>

            <div className="txLine">
              <span className="muted">Hash</span>
              {txHash ? (
                <span className="txHash">
                  <a
                    href={`${ETHERSCAN_TX_BASE_URL}${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {txHash.slice(0, 10)}...{txHash.slice(-6)}
                  </a>
                  <button
                    className="iconBtn"
                    onClick={async () => {
                      const ok = await copyToClipboard(txHash)
                      showToast(ok ? 'Hash copié' : 'Copie impossible')
                    }}
                    title="Copier le hash"
                  >
                    Copier
                  </button>
                </span>
              ) : (
                <span>—</span>
              )}
            </div>

            <div className="txLine">
              <span className="muted">Bloc</span>
              <span>{lastBlockNumber ? `#${lastBlockNumber}` : '—'}</span>
            </div>

            {txError && <div className="txError">{txError}</div>}
          </div>

          <div className="divider" />

          <div className="explorer">
            <button className="btn btnSecondary" onClick={() => setExplorerOpen((o) => !o)}>
              {explorerOpen ? 'Masquer' : 'Blockchain Explorer'}
            </button>

            {explorerOpen && (
              <div className="explorerBody">
                {explorerLoading ? (
                  <p className="muted">Chargement des données on-chain...</p>
                ) : explorerEvents.length === 0 ? (
                  <p className="muted">Aucun vote enregistré pour l’instant.</p>
                ) : (
                  <div className="tableWrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Tx Hash</th>
                          <th>Bloc</th>
                          <th>Votant</th>
                          <th>Candidat</th>
                          <th>Heure</th>
                          <th>Gas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {explorerEvents.map((e, i) => (
                          <tr
                            key={i}
                            className="clickRow"
                            onClick={() => openBlockModal(e.blockNumber)}
                            title="Voir les détails du bloc"
                          >
                            <td>
                              <a
                                href={`${ETHERSCAN_TX_BASE_URL}${e.hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(evt) => evt.stopPropagation()}
                              >
                                {e.hash.slice(0, 10)}...{e.hash.slice(-6)}
                              </a>
                            </td>
                            <td>{e.blockNumber}</td>
                            <td>
                              {e.voter.slice(0, 10)}...{e.voter.slice(-6)}
                            </td>
                            <td>{e.candidateName}</td>
                            <td>
                              {e.timestamp
                                ? new Date(e.timestamp * 1000).toLocaleString('fr-FR')
                                : '—'}
                            </td>
                            <td>{e.gasUsed ? `${e.gasUsed.toLocaleString()} u.` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="explorerActions">
                  <button className="btn btnSecondary" onClick={loadExplorerEvents}>
                    Recharger
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <span className="muted small">
          Contrat : <code>{CONTRACT_ADDRESS}</code>
        </span>
      </footer>

      {toast && <div className="toast">{toast}</div>}

      {blockModalOpen && (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Détails du bloc"
          onClick={() => setBlockModalOpen(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <h2>Détails du bloc</h2>
                <div className="muted small">
                  {blockModalLoading
                    ? 'Chargement...'
                    : blockDetails?.blockNumber
                      ? `Bloc #${blockDetails.blockNumber}`
                      : '—'}
                </div>
              </div>
              <button className="iconBtn" onClick={() => setBlockModalOpen(false)}>
                Fermer
              </button>
            </div>

            {!blockModalLoading && blockDetails?.notFound && <div className="muted">Bloc introuvable.</div>}
            {!blockModalLoading && blockDetails?.error && <div className="muted">Impossible de charger ce bloc.</div>}

            {!blockModalLoading && blockDetails && !blockDetails.error && !blockDetails.notFound && (
              <div className="kv">
                <div className="kvRow">
                  <span className="muted">Heure</span>
                  <span>
                    {blockDetails.timestamp
                      ? new Date(blockDetails.timestamp * 1000).toLocaleString('fr-FR')
                      : '—'}
                  </span>
                </div>
                <div className="kvRow">
                  <span className="muted">Parent hash</span>
                  <span className="mono">{blockDetails.parentHash ?? '—'}</span>
                </div>
                <div className="kvRow">
                  <span className="muted">Hash</span>
                  <span className="mono">{blockDetails.hash ?? '—'}</span>
                </div>
                <div className="kvRow">
                  <span className="muted">Validateur</span>
                  <span className="mono">{blockDetails.miner ?? '—'}</span>
                </div>
                <div className="kvRow">
                  <span className="muted">Gas limit</span>
                  <span className="mono">{blockDetails.gasLimit ?? '—'}</span>
                </div>
                <div className="kvRow">
                  <span className="muted">Gas utilisé</span>
                  <span className="mono">{blockDetails.gasUsed ?? '—'}</span>
                </div>
              </div>
            )}

            <div className="modalActions">
              <button className="btn btnSecondary" onClick={() => gotoBlock(-1)} disabled={blockModalLoading}>
                ← Bloc -1
              </button>
              <button className="btn btnSecondary" onClick={() => gotoBlock(+1)} disabled={blockModalLoading}>
                Bloc +1 {'>'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
