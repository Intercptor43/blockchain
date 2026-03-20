# Projet B3 SI - Scrutin Blockchain (React + Vite)

Ce projet a ete realise dans un contexte de Bachelor 3 SI pour comprendre comment un frontend web peut interagir avec un smart contract Ethereum.

L application permet de consulter les resultats d un scrutin et de voter via MetaMask sur le reseau Sepolia.

## 1. Objectifs pedagogiques

Ce projet permet de pratiquer:

- integration frontend + blockchain
- utilisation de la bibliotheque Ethers.js
- gestion d etat React (hooks)
- appels on-chain en lecture et en ecriture
- gestion des erreurs utilisateur (wallet, reseau, transaction)
- conception d une interface exploitable pour une demo de cours

## 2. Ce que fait l application

- affiche la liste des candidats et leurs votes
- permet de connecter MetaMask
- force/verifie l utilisation du reseau Sepolia
- envoie une transaction de vote
- affiche les etapes de transaction (signature, envoi, confirmation)
- lit un cooldown avant autorisation d un nouveau vote
- ecoute les events Voted pour rafraichir les donnees
- propose un mini explorer des derniers votes

## 3. Technologies utilisees

- React 19
- Vite 8
- Ethers 6
- ESLint 9

## 4. Prerequis

- Node.js 18+
- npm
- extension MetaMask (pour voter)

## 5. Installation

Depuis la racine du projet:

~~~bash
npm install
~~~

## 6. Lancement en local

Commande standard:

~~~bash
npm run dev
~~~

Si PowerShell bloque npm.ps1 (cas frequent sous Windows):

~~~powershell
npm.cmd run dev
~~~

Ensuite ouvrir l URL affichee par Vite (exemple: http://localhost:5173 ou 5174).

## 7. Scripts utiles

~~~bash
npm run dev      # lancement mode developpement
npm run build    # build production
npm run preview  # visualisation du build
npm run lint     # verification style/code
~~~

## 8. Configuration blockchain

Le fichier src/config.js contient les constantes principales:

- CONTRACT_ADDRESS
- EXPECTED_CHAIN_ID
- EXPECTED_NETWORK_NAME
- RPC_URL
- ETHERSCAN_TX_BASE_URL

Valeurs actuelles du projet:

- CONTRACT_ADDRESS: 0x07dc061bf3C8e7F5dB6d908B4E86eB9F0ab5fa35
- EXPECTED_CHAIN_ID: 11155111
- EXPECTED_NETWORK_NAME: Sepolia
- RPC_URL: https://rpc.sepolia.org
- ETHERSCAN_TX_BASE_URL: https://sepolia.etherscan.io/tx/

## 9. Structure du projet

~~~text
.
|- public/
|- src/
|  |- abi.json      # interface du contrat (fonctions/events)
|  |- config.js     # config reseau et contrat
|  |- App.jsx       # logique principale React + web3
|  |- App.css       # style principal de la page
|  |- index.css     # styles globaux et variables CSS
|  |- main.jsx      # point d entree React
|- index.html
|- package.json
|- vite.config.js
|- eslint.config.js
~~~

## 10. Explication simple du fonctionnement

### 10.1 Lecture des resultats

Au chargement de la page:

1. le frontend cree un provider
2. il lit le nombre de candidats
3. il lit chaque candidat et son score
4. il affiche les resultats

### 10.2 Connexion MetaMask

Quand l utilisateur clique sur "Connecter MetaMask":

1. demande d acces au wallet
2. verification du reseau Sepolia
3. recuperation de l adresse du compte
4. affichage du compte et du solde

### 10.3 Vote

Quand l utilisateur clique sur "Voter":

1. verification du cooldown on-chain
2. signature MetaMask
3. envoi de la transaction
4. attente de confirmation bloc
5. rechargement des resultats

### 10.4 Explorer

Le mini explorer:

- lit les derniers events Voted
- affiche hash tx, bloc, votant, candidat, heure, gas
- permet d ouvrir les details d un bloc

## 11. Fonctions du contrat attendues (ABI)

Le frontend attend les fonctions suivantes:

- getCandidatesCount()
- getCandidate(index)
- vote(candidateIndex)
- getTimeUntilNextVote(voter)
- event Voted(voter, candidateIndex)

Si le contrat ou ABI change, il faut mettre a jour src/abi.json.

## 12. Erreurs frequentes et solutions

### 12.1 Erreur npm.ps1 sous Windows

Solution immediate:

~~~powershell
npm.cmd run dev
~~~

### 12.2 Impossible de lire le contrat

Verifier:

- connexion internet
- disponibilite du RPC
- adresse du contrat
- ABI coherente avec le contrat deploye

### 12.3 Impossible de voter

Verifier:

- MetaMask installe/deverrouille
- reseau Sepolia actif
- ETH de test disponible pour le gas
- cooldown ecoule

## 13. Ce que montre ce projet pour un dossier B3 SI

- maitrise d un frontend moderne React
- capacite a consommer une API blockchain (smart contract)
- gestion des interactions utilisateur en contexte web3
- comprehension du cycle d une transaction Ethereum
- bonne pratique de documentation technique

## 14. Limites actuelles

- pas de backend
- pas de test automatise dans le repo actuel
- explorer volontairement simple (usage pedagogique)

## 15. Pistes d amelioration

- ajouter des tests unitaires (React) et integration
- ajouter fallback multi-RPC
- ajouter pagination/filtre dans l explorer
- ajouter authentification role admin (si extension du contrat)
- ajouter CI (lint + build) sur GitHub Actions

## 16. Auteur et contexte

Projet realise par Naël Meignant, Marthe Brau, Alan Ott, Téo Artmeier pour demontrer l integration d un frontend React avec un smart contract Ethereum sur Sepolia.
