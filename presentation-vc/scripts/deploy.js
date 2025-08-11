// scripts/deploy.js
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const Presentation = await hre.ethers.getContractFactory("PresentationRegistry");
  console.log("Deploying PresentationRegistry...");
  const presentation = await Presentation.deploy();
  await presentation.deployed();
  console.log("PresentationRegistry deployed to:", presentation.address);

  // Prepare deployments dir
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const networkName = hre.network.name || "unknown";
  const out = {
    address: presentation.address,
    network: networkName,
    abi: JSON.parse(presentation.interface.format(hre.ethers.utils.FormatTypes.json)),
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(deploymentsDir, `${networkName}.PresentationRegistry.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Saved deployment info to ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
