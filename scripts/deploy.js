const { ethers } = require("hardhat");

async function main() {
  // Define the issuer's DID (e.g., ABYA University's DID)
  const issuerDID = "did:example:abyaUniversity";

  // Get the contract factory and deploy the contract with the issuer's DID
  const UniversityVC = await ethers.getContractFactory("UniversityVC");
  const vcContract = await UniversityVC.deploy(issuerDID);
  await vcContract.waitForDeployment(); // For ethers v6
  console.log("UniversityVC deployed to:", vcContract.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
