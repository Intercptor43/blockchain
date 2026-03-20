const { ethers, network } = require("hardhat");

async function main() {
  console.log("Déploiement du contrat Vote...");
  console.log("Réseau:", network.name);
  
  const VoteFactory = await ethers.getContractFactory("Vote");
  const vote = await VoteFactory.deploy();
  await vote.waitForDeployment();
  
  const address = await vote.getAddress();
  console.log("Contrat déployé à :", address);
  
  if (network.name === "sepolia") {
    console.log("Etherscan :", `https://sepolia.etherscan.io/address/${address}`);
  }
  
  console.log("Ajout des candidats...");
  await (await vote.addCandidate("Alice")).wait();
  await (await vote.addCandidate("Bob")).wait();
  await (await vote.addCandidate("Charlie")).wait();
  console.log("3 candidats ajoutés");
  
  console.log("Adresse du contrat:", address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
