const { ethers } = require("hardhat");

async function main() {
  console.log("Test du contrat Vote...");
  
  const [owner, user1, user2] = await ethers.getSigners();
  console.log("Owner:", owner.address);
  console.log("User1:", user1.address);
  console.log("User2:", user2.address);
  
  const VoteFactory = await ethers.getContractFactory("Vote");
  const vote = await VoteFactory.deploy();
  await vote.waitForDeployment();
  const address = await vote.getAddress();
  console.log("Contrat déployé à:", address);
  
  await (await vote.addCandidate("Alice")).wait();
  await (await vote.addCandidate("Bob")).wait();
  await (await vote.addCandidate("Charlie")).wait();
  console.log("3 candidats ajoutés");
  
  let candidate0 = await vote.getCandidate(0);
  console.log("Candidat 0:", candidate0.name, "- Votes:", candidate0.votes.toString());
  
  await (await vote.vote(0)).wait();
  console.log("Owner a voté pour Alice");
  
  candidate0 = await vote.getCandidate(0);
  console.log("Alice a", candidate0.votes.toString(), "votes");
  
  await (await vote.connect(user1).vote(0)).wait();
  console.log("User1 a voté pour Alice");
  
  try {
    await (await vote.vote(1)).wait();
    console.log("ERREUR: Le vote aurait dû être rejeté");
  } catch (error) {
    console.log("Vote rejeté: cooldown actif");
  }
  
  try {
    await (await vote.vote(99)).wait();
    console.log("ERREUR: Le vote aurait dû être rejeté");
  } catch (error) {
    console.log("Vote rejeté: candidat invalide");
  }
  
  console.log("Tests terminés");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
