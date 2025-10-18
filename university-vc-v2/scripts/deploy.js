const { ethers } = require("hardhat");

async function main() {
  // Get signers
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contract with account:", deployer.address);

  // Deploy the contract with deployer as admin
  const UniversityVC = await ethers.getContractFactory("UniversityVCV2");
  const vcContract = await UniversityVC.deploy(deployer.address); // expects address, not DID
  await vcContract.waitForDeployment();

  console.log("UniversityVCV2 deployed to:", vcContract.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// npx hardhat run scripts/deploy.js --network sepolia
//npx hardhat verify --network sepolia 0xA15c8F4bCBD63dFC5Ba68f66B85367b92A444972 0xeDB147c7fb742a5648359818EE0936a68Fce173d

//  --- IGNORE ---