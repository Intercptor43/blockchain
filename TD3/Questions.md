# Fiche d'Analyse — Smart Contract dApp Vote Présidentielle

**Noms** : ARTMEIER Téo, BRAU Marthe, OTT Alan, MEIGNANT Naël  
**Contrat analysé** : `0x291Ac3C6a92dF373dEa40fee62Ad39831B8A1DDC` (Sepolia)  
**Application** : https://dapp-vote-starter-vbd7.vercel.app/

---

## Phase 1 — Observation de l'interface

### 1.1 — Ce que vous voyez sans wallet

**Les résultats du vote s'affichent-ils avant connexion MetaMask ?**  
Oui. Les résultats (nombres de votes par candidat) sont visibles sans wallet connecté.

**Comment est-ce possible ?**  
Les données de vote sont stockées dans un smart contract public sur la blockchain Sepolia. N'importe qui peut lire l'état du contrat sans s'authentifier, la lecture est gratuite et ouverte. Le frontend interroge le contrat via un nœud RPC public sans avoir besoin d'un compte.

**Éléments identifiés :**
- Compteurs de votes par candidat (variables publiques du contrat)
- Noms/identifiants des candidats
- Interface de vote (boutons) visible mais probablement désactivée

---

### 1.2 — Connexion MetaMask

**Quelle info nouvelle après connexion ?**  
L'adresse Ethereum du wallet connecté est affichée. Le bouton de vote devient actif. On peut aussi voir si l'adresse a déjà voté et si le cooldown est en cours.

**MetaMask a-t-il demandé un mot de passe ou login ?**  
Non, pas de mot de passe pour se connecter à la dApp. MetaMask demande seulement d'approuver la connexion de l'adresse au site, pas de login/password.

**Modèle d'authentification Web3 vs Web2 ?**

| | Web2 | Web3 |
|---|---|---|
| **Identité** | Email + mot de passe (géré par un serveur) | Clé privée (paire de clés cryptographiques) |
| **Preuve** | Session/token côté serveur | Signature cryptographique (ECDSA) |
| **Confiance** | L'utilisateur fait confiance au serveur | L'utilisateur contrôle sa propre clé |
| **Récupération** | "Mot de passe oublié" | Phrase mnémonique (seed phrase) |

---

## Phase 2 — Voter et observer la transaction

### 2.1 — Envoyer un vote

**Adresse du contrat dans la popup MetaMask ?**  
`0x07dc061bf3C8e7F5dB6d908B4E86eB9F0ab5fa35`

**Coût en gas estimé ?**  
1.500000011 Gwei (0.000000001500000011 ETH)

**Pourquoi le vote coûte-t-il du gas ?**  
Parce que voter implique d'écrire sur la blockchain (modifier l'état du contrat : incrémenter un compteur, enregistrer l'adresse du votant, mettre à jour le timestamp). Toute opération d'écriture consomme du gas, contrairement à la lecture qui est gratuite.

---

### 2.2 — Analyser la transaction confirmée

**Hash de la transaction :**  
0x3b0895baefaabb1926752fba22bab04aa60cf4dee2741149640b6d60ffc2a56e

**gasUsed vs gasLimit ?**  
En général, `gasUsed` est inférieur à `gasLimit` — le `gasLimit` est une sécurité maximale fixée à l'envoi, et le gas non utilisé est remboursé.

---

### 2.3 — Le cooldown de 3 minutes

**Que se passe-t-il si on revote immédiatement ?**  
La transaction est **rejetée** par le smart contract. Un message d'erreur s'affiche (revert), et on perd quand même une petite quantité de gas.

**Restriction dans le frontend ou le smart contract ?**  
Dans le **smart contract**. Le frontend peut aussi bloquer l'UI pour UX, mais la vraie protection est dans le contrat : elle est incontournable côté blockchain.

**Variable et fonction concernées ?**
- Variable : `lastVoteTime[address]` (mapping qui stocke le timestamp du dernier vote par adresse)
- Fonction : `vote()` (ou équivalent), qui contient un `require(block.timestamp >= lastVoteTime[msg.sender] + 180, "Cooldown actif")`

---

## Phase 3 — Investigation on-chain via Etherscan

### 3.1 — Transactions

**Nombre total de transactions ?**  
A total of 115 transactions found

**Date de la première transaction ?**  
17/03/2026 

**Pourquoi la première est différente ?**  
La première transaction est le déploiement du contrat (transaction de création). Elle a pour destinataire `null`/`0x0` et contient le bytecode du contrat. Toutes les suivantes sont des appels de fonction (`vote()`).

---

### 3.2 — Events

**Nom de l'event ?**  
Probablement `Voted(address indexed voter, uint candidateId)` ou similaire

**Paramètres ?**  
Typiquement : l'adresse du votant (`indexed`), l'identifiant du candidat, et éventuellement un timestamp

**Pourquoi un event plutôt qu'une variable ?**  
Les events sont stockés dans les **logs** de la transaction, pas dans le storage du contrat. Ils sont beaucoup moins chers en gas. Ils permettent à des outils externes (Etherscan, The Graph, front-end via `eth_getLogs`) de suivre l'historique des votes sans avoir à stocker tout l'historique dans des variables coûteuses.

---

### 3.3 — Contract

**Code source visible ?**  
Oui, si le contrat a été vérifié sur Etherscan (onglet "Contract" avec coche verte ✓)

**Ligne qui vérifie le cooldown :**
```solidity
require(block.timestamp >= lastVoteTime[msg.sender] + 180, "Please wait 3 minutes before voting again");
```

**Si le require échoue ?**  
La transaction est revertée : tous les changements d'état sont annulés, le message d'erreur est renvoyé, et le gas consommé jusqu'au revert est perdu (mais pas le gas limit entier).

---

### 3.4 — Bloc via le Blockchain Explorer

Transaction analysée : `0x3b0895baefaabb1926752fba22bab04aa60cf4dee2741149640b6d60ffc2a56e` — Bloc 10 48 3421 (Mar-20-2026 11:10:24 AM +UTC)

**Qu'est-ce que le parentHash ?**  
Le `parentHash` est l'empreinte cryptographique (hash) du bloc précédent. C'est ce mécanisme qui forme la chaîne de blocs : chaque bloc référence le précédent, rendant toute modification rétroactive détectable immédiatement (changer un ancien bloc invaliderait tous les hashes suivants).

**Le bloc précédent contient-il un vote ?**  
En cliquant sur le bloc 10 48 3421 et en cherchant si une transaction vers `0x07dc061b...` apparaît.

---

## Phase 4 — Analyse critique

### 4.1 — Propriétés exploitées
- **Transparence** : tout le code et toutes les transactions sont publics et vérifiables
- **Immuabilité** : un vote enregistré ne peut pas être effacé ou modifié
- **Décentralisation** : aucun serveur central ne peut censurer ou altérer les votes
- **Exécution automatique** : les règles (cooldown, unicité par wallet) s'appliquent sans intermédiaire

### 4.2 — Limites

**Le vote est-il anonyme ?**  
Non. L'adresse du votant est publique dans chaque transaction. Toute personne connaissant votre adresse sait pour qui vous avez voté. C'est de la **pseudonymie**, pas de l'anonymat.

**Peut-on contourner le cooldown ?**  
Oui, facilement : il suffit d'utiliser **une autre adresse Ethereum**. Créer un nouveau wallet est gratuit et instantané. Le cooldown s'applique par adresse, pas par identité réelle. Avec suffisamment de wallets (et des ETH de test Sepolia via un faucet), on peut voter en continu.

**Quelqu'un pourrait-il déployer une autre interface sur le même contrat ?**  
Oui, absolument. Le contrat est public, son ABI est disponible sur Etherscan. N'importe qui peut développer une autre interface web (ou script) qui interagit avec `0x07dc061b...`. La dApp Vercel n'a aucun monopole sur le contrat.

### 4.3 — Verdict final
Ce smart contract démontre bien les **garanties fondamentales de la blockchain** : transparence, résistance à la censure, exécution automatique des règles. Cependant, pour un vrai vote présidentiel, il échoue sur plusieurs points critiques : absence d'anonymat, absence de vérification d'identité (1 personne = N wallets), et réseau de test sans valeur économique réelle.

---

## Fiche de synthèse

**Qu'est-ce qu'un smart contract ?**  
Un programme informatique déployé sur une blockchain, dont le code et l'exécution sont publics, automatiques et immuables. Il s'exécute exactement comme programmé, sans possibilité d'intervention ou de censure d'un tiers — pas même de son créateur.

**Différence frontend (Vercel) vs smart contract (Sepolia) ?**

| | Frontend (Vercel) | Smart Contract (Sepolia) |
|---|---|---|
| **Nature** | Site web classique, modifiable | Code immuable sur la blockchain |
| **Hébergement** | Serveur centralisé | Réseau décentralisé de nœuds |
| **Confiance** | L'opérateur peut modifier l'interface | Personne ne peut modifier le contrat |
| **Rôle** | Afficher et interagir avec le contrat | Stocker et appliquer les règles du vote |

Le frontend peut changer (ou disparaître) sans affecter les votes — les données et règles vivent dans le contrat.

