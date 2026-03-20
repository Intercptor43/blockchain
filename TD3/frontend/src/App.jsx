import { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import ABI from './abi.json';
import { CONTRACT_ADDRESS, EXPECTED_CHAIN_ID, EXPECTED_NETWORK_NAME } from './config';
import './App.css';

const getCandidateImage = (id, name) => {
  const styles = ['adventurer', 'avataaars', 'big-ears', 'bottts', 'fun-emoji'];
  const style = styles[id % styles.length];
  const seed = encodeURIComponent(name || `candidate-${id}`);
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
};

const getCandidateEmoji = (id) => {
  const emojis = ['👩‍💼', '👨‍💼', '🧑‍💼', '👩‍🎨', '👨‍🚀', '👩‍🔬', '👨‍⚖️', '👩‍🏫'];
  return emojis[id % emojis.length];
};

const CHART_COLORS = [
  '#4a90d9', '#2ecc71', '#f39c12', '#e74c3c', 
  '#9b59b6', '#1abc9c', '#34495e', '#e67e22'
];

function PieChart({ data, total }) {
  if (!data || data.length === 0 || total === 0) return null;

  let currentAngle = 0;
  const radius = 80;
  const center = 100;

  const slices = data.map((item, index) => {
    const percentage = (item.votes / total) * 100;
    const angle = (item.votes / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle += angle;

    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    const path = `
      M ${center} ${center}
      L ${x1} ${y1}
      A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
      Z
    `;

    const labelAngle = (startAngle + endAngle) / 2 - 90;
    const labelRadius = radius * 0.65;
    const labelX = center + labelRadius * Math.cos(labelAngle * (Math.PI / 180));
    const labelY = center + labelRadius * Math.sin(labelAngle * (Math.PI / 180));

    return {
      path,
      color: CHART_COLORS[index % CHART_COLORS.length],
      percentage: percentage.toFixed(1),
      labelX,
      labelY,
      ...item
    };
  });

  return (
    <div className="pie-chart-container">
      <svg viewBox="0 0 200 200" className="pie-chart">
        {slices.map((slice, index) => (
          <g key={index}>
            <path
              d={slice.path}
              fill={slice.color}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="2"
              className="pie-slice"
            />
            {parseFloat(slice.percentage) > 8 && (
              <text
                x={slice.labelX}
                y={slice.labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pie-label"
              >
                {slice.percentage}%
              </text>
            )}
          </g>
        ))}
        <circle cx={center} cy={center} r={radius * 0.35} className="pie-center" />
        <text x={center} y={center - 5} textAnchor="middle" className="pie-center-text">
          {total}
        </text>
        <text x={center} y={center + 12} textAnchor="middle" className="pie-center-subtext">
          votes
        </text>
      </svg>
      
      <div className="pie-legend">
        {slices.map((slice, index) => (
          <div key={index} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: slice.color }} />
            <span className="legend-name">{slice.name}</span>
            <span className="legend-value">{slice.votes}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [networkError, setNetworkError] = useState(null);
  
  const [candidates, setCandidates] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [winner, setWinner] = useState(null);
  const [timeUntilNextVote, setTimeUntilNextVote] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [lastVoteTimestamp, setLastVoteTimestamp] = useState(0);
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : true;
  });
  const [voteHistory, setVoteHistory] = useState([]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    document.body.classList.toggle('dark-mode', darkMode);
    document.body.classList.toggle('light-mode', !darkMode);
  }, [darkMode]);

  const connectWallet = async () => {
    try {
      setError(null);
      
      if (!window.ethereum) {
        setError("MetaMask n'est pas installé. Veuillez l'installer.");
        return;
      }

      const browserProvider = new BrowserProvider(window.ethereum);
      
      const network = await browserProvider.getNetwork();
      const chainId = Number(network.chainId);
      
      if (chainId !== EXPECTED_CHAIN_ID) {
        setNetworkError(`Veuillez passer sur le réseau ${EXPECTED_NETWORK_NAME} (Chain ID: ${EXPECTED_CHAIN_ID})`);
        return;
      }
      
      setNetworkError(null);
      
      await browserProvider.send("eth_requestAccounts", []);
      
      const newSigner = await browserProvider.getSigner();
      const address = await newSigner.getAddress();
      
      setProvider(browserProvider);
      setSigner(newSigner);
      setAccount(address);
      setIsConnected(true);
      
      const voteContract = new Contract(CONTRACT_ADDRESS, ABI, newSigner);
      setContract(voteContract);
      
      await loadVoteHistory(voteContract, browserProvider);
      
      setSuccess(`Connecté avec succès : ${address.slice(0, 6)}...${address.slice(-4)}`);
      setTimeout(() => setSuccess(null), 3000);
      
    } catch (err) {
      console.error("Erreur de connexion:", err);
      if (err.code === 4001) {
        setError("Connexion refusée par l'utilisateur");
      } else {
        setError("Erreur de connexion: " + err.message);
      }
    }
  };

  const disconnectWallet = () => {
    setProvider(null);
    setSigner(null);
    setContract(null);
    setAccount(null);
    setIsConnected(false);
    setCandidates([]);
    setTotalVotes(0);
    setWinner(null);
    setTimeUntilNextVote(0);
    setLastVoteTimestamp(0);
    setVoteHistory([]);
    setSuccess("Déconnecté");
    setTimeout(() => setSuccess(null), 2000);
  };

  const loadContractData = useCallback(async () => {
    if (!provider) return;
    
    try {
      const readContract = new Contract(CONTRACT_ADDRESS, ABI, provider);
      
      const count = await readContract.candidatesCount();
      
      const candidatesData = [];
      for (let i = 0; i < Number(count); i++) {
        const candidate = await readContract.getCandidate(i);
        candidatesData.push({
          id: i,
          name: candidate.name,
          votes: Number(candidate.votes),
          image: getCandidateImage(i, candidate.name),
          emoji: getCandidateEmoji(i)
        });
      }
      setCandidates(candidatesData);
      
      const total = await readContract.getTotalVotes();
      setTotalVotes(Number(total));
      
      if (count > 0) {
        const winnerData = await readContract.getWinner();
        setWinner({
          id: Number(winnerData.winnerId),
          name: winnerData.winnerName,
          votes: Number(winnerData.winnerVotes),
          image: getCandidateImage(Number(winnerData.winnerId), winnerData.winnerName),
          emoji: getCandidateEmoji(Number(winnerData.winnerId))
        });
      }
      
      if (account) {
        const timeRemaining = await readContract.getTimeUntilNextVote(account);
        setTimeUntilNextVote(Number(timeRemaining));
        
        const lastVoteTime = await readContract.lastVoteTime(account);
        setLastVoteTimestamp(Number(lastVoteTime) * 1000);
      }
      
    } catch (err) {
      console.error("Erreur lors du chargement des données:", err);
    }
  }, [provider, account]);

  const loadVoteHistory = async (voteContract, prov) => {
    try {
      const readContract = new Contract(CONTRACT_ADDRESS, ABI, prov);
      
      const currentBlock = await prov.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100);
      
      const filter = readContract.filters.VoteCast();
      const events = await readContract.queryFilter(filter, fromBlock);
      
      const history = await Promise.all(
        events.slice(-10).reverse().map(async (event) => {
          const { voter, candidateId, timestamp } = event.args;
          const candidate = await readContract.getCandidate(Number(candidateId));
          return {
            voter: voter,
            candidateId: Number(candidateId),
            candidateName: candidate.name,
            timestamp: Number(timestamp) * 1000,
            image: getCandidateImage(Number(candidateId), candidate.name),
            emoji: getCandidateEmoji(Number(candidateId)),
            txHash: event.transactionHash
          };
        })
      );
      
      setVoteHistory(history);
    } catch (err) {
      console.error("Erreur chargement historique:", err);
    }
  };

  const vote = async (candidateId) => {
    if (!contract) {
      setError("Veuillez d'abord connecter votre wallet");
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const tx = await contract.vote(candidateId);
      await tx.wait();
      
      setLastVoteTimestamp(Date.now());
      setTimeUntilNextVote(60);
      
      setSuccess(`Vote enregistré pour ${candidates[candidateId]?.name || 'le candidat'} !`);
      setTimeout(() => setSuccess(null), 3000);
      
      await loadContractData();
      
    } catch (err) {
      console.error("Erreur de vote:", err);
      if (err.code === 4001) {
        setError("Transaction annulée");
      } else if (err.message?.includes("cooldown") || err.shortMessage?.includes("Attendez")) {
        setError("Vous devez attendre 1 minute entre deux votes");
      } else {
        setError("Erreur lors du vote: " + (err.shortMessage || err.message));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
      
      if (lastVoteTimestamp > 0) {
        const elapsed = Math.floor((Date.now() - lastVoteTimestamp) / 1000);
        const remaining = Math.max(0, 60 - elapsed);
        setTimeUntilNextVote(remaining);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [lastVoteTimestamp]);

  useEffect(() => {
    if (!provider) return;
    
    const readContract = new Contract(CONTRACT_ADDRESS, ABI, provider);
    
    const handleVoteCast = async (voter, candidateId, timestamp, event) => {
      const candidate = await readContract.getCandidate(Number(candidateId));
      const newVote = {
        voter: voter,
        candidateId: Number(candidateId),
        candidateName: candidate.name,
        timestamp: Date.now(),
        image: getCandidateImage(Number(candidateId), candidate.name),
        emoji: getCandidateEmoji(Number(candidateId)),
        txHash: event.log.transactionHash
      };
      
      setVoteHistory(prev => [newVote, ...prev].slice(0, 10));
      loadContractData();
    };
    
    readContract.on("VoteCast", handleVoteCast);
    
    return () => {
      readContract.off("VoteCast", handleVoteCast);
    };
  }, [provider, loadContractData]);

  useEffect(() => {
    loadContractData();
    const interval = setInterval(loadContractData, 10000);
    return () => clearInterval(interval);
  }, [loadContractData]);

  const formatTime = (seconds) => {
    if (seconds <= 0) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const getCooldownProgress = () => {
    if (timeUntilNextVote <= 0) return 100;
    return ((60 - timeUntilNextVote) / 60) * 100;
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className={`app ${darkMode ? 'dark' : 'light'}`}>
      <header className="header">
        <h1>🗳️ Système de Vote Décentralisé</h1>
        <div className="header-right">
          <button 
            className="theme-toggle" 
            onClick={toggleDarkMode}
            title={darkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <div className="network-badge">
            {EXPECTED_NETWORK_NAME}
          </div>
        </div>
      </header>

      <main className="main">
        {networkError && (
          <div className="alert alert-error">
            ⚠️ {networkError}
          </div>
        )}
        {error && (
          <div className="alert alert-error">
            ❌ {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success">
            ✅ {success}
          </div>
        )}

        <section className="card">
          <h2>Connexion Wallet</h2>
          {!isConnected ? (
            <button 
              className="btn btn-primary" 
              onClick={connectWallet}
              disabled={isLoading}
            >
              {isLoading ? 'Connexion...' : '🔗 Connecter MetaMask'}
            </button>
          ) : (
            <div className="wallet-info">
              <p>
                <strong>Connecté:</strong> {account.slice(0, 6)}...{account.slice(-4)}
              </p>
              
              {timeUntilNextVote > 0 ? (
                <div className="cooldown-container">
                  <div className="cooldown-header">
                    <span className="cooldown-icon">⏱️</span>
                    <span className="cooldown-text">Prochain vote dans:</span>
                    <span className="cooldown-timer">{formatTime(timeUntilNextVote)}</span>
                  </div>
                  <div className="cooldown-bar-container">
                    <div 
                      className="cooldown-bar-fill"
                      style={{width: `${getCooldownProgress()}%`}}
                    />
                  </div>
                  <p className="cooldown-subtext">
                    Veuillez patienter 1 minute entre chaque vote
                  </p>
                </div>
              ) : lastVoteTimestamp > 0 ? (
                <div className="cooldown-ready">
                  <span className="ready-icon">✅</span>
                  <span>Vous pouvez voter maintenant !</span>
                </div>
              ) : null}
              
              <button 
                className="btn btn-secondary" 
                onClick={disconnectWallet}
              >
                Déconnecter
              </button>
            </div>
          )}
        </section>

        <section className="card">
          <h2>📊 Statistiques</h2>
          <div className="stats-container">
            <div className="stats-row">
              <div className="stat-item">
                <span className="stat-value">{totalVotes}</span>
                <span className="stat-label">Votes totaux</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{candidates.length}</span>
                <span className="stat-label">Candidats</span>
              </div>
            </div>
            
            {totalVotes > 0 && (
              <PieChart data={candidates} total={totalVotes} />
            )}
          </div>
          
          {winner && (
            <div className="winner-box">
              <h3>🏆 Gagnant actuel</h3>
              <div className="winner-content">
                <img 
                  src={winner.image} 
                  alt={winner.name}
                  className="winner-avatar"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="winner-emoji-fallback" style={{display: 'none'}}>
                  {winner.emoji}
                </div>
                <div className="winner-info">
                  <p className="winner-name">{winner.name}</p>
                  <p className="winner-votes">{winner.votes} votes</p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <h2>👥 Candidats</h2>
          {isLoading && candidates.length === 0 ? (
            <p className="loading">Chargement...</p>
          ) : candidates.length === 0 ? (
            <p className="empty">Aucun candidat enregistré</p>
          ) : (
            <div className="candidates-list">
              {candidates.map((candidate) => (
                <div key={candidate.id} className="candidate-card">
                  <div className="candidate-avatar-container">
                    <img 
                      src={candidate.image} 
                      alt={candidate.name}
                      className="candidate-avatar"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                    <div className="candidate-emoji-fallback" style={{display: 'none'}}>
                      {candidate.emoji}
                    </div>
                  </div>
                  
                  <div className="candidate-info">
                    <h3>{candidate.name}</h3>
                    <p className="vote-count">
                      {candidate.votes} vote{candidate.votes !== 1 ? 's' : ''}
                    </p>
                    {totalVotes > 0 && (
                      <div className="progress-bar">
                        <div 
                          className="progress-fill"
                          style={{width: `${(candidate.votes / totalVotes) * 100}%`}}
                        />
                        <span className="progress-text">
                          {((candidate.votes / totalVotes) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <button
                    className="btn btn-vote"
                    onClick={() => vote(candidate.id)}
                    disabled={!isConnected || isLoading || timeUntilNextVote > 0}
                    title={timeUntilNextVote > 0 ? `Attendez ${formatTime(timeUntilNextVote)}` : 'Voter'}
                  >
                    {isLoading ? '...' : timeUntilNextVote > 0 ? '⏳' : 'Voter'}
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <button 
            className="btn btn-refresh"
            onClick={loadContractData}
            disabled={isLoading}
          >
            🔄 Rafraîchir
          </button>
        </section>

        <section className="card">
          <h2>📜 Activité récente</h2>
          {voteHistory.length === 0 ? (
            <p className="empty">Aucun vote récent</p>
          ) : (
            <div className="vote-history">
              {voteHistory.map((vote, index) => (
                <div key={index} className="history-item">
                  <div className="history-avatar-container">
                    <img 
                      src={vote.image} 
                      alt={vote.candidateName}
                      className="history-avatar"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                    <div className="history-emoji-fallback" style={{display: 'none'}}>
                      {vote.emoji}
                    </div>
                  </div>
                  <div className="history-info">
                    <p className="history-action">
                      Vote pour <strong>{vote.candidateName}</strong>
                    </p>
                    <p className="history-details">
                      par {vote.voter.slice(0, 6)}...{vote.voter.slice(-4)} • {formatTimestamp(vote.timestamp)}
                    </p>
                  </div>
                  <a 
                    href={`https://sepolia.etherscan.io/tx/${vote.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="history-link"
                    title="Voir sur Etherscan"
                  >
                    🔗
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card card-info">
          <h2>ℹ️ Informations</h2>
          <p><strong>Adresse du contrat:</strong></p>
          <code className="address-code">{CONTRACT_ADDRESS}</code>
          <p className="note">
            Ce contrat est déployé sur {EXPECTED_NETWORK_NAME}. 
            Vous devez avoir des ETH de test pour interagir avec lui.
          </p>
        </section>
      </main>

      <footer className="footer">
        <p>TD3 - Smart Contract Voting © 2026</p>
      </footer>
    </div>
  );
}

export default App;
