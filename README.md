# 🎓 UniversityVC - Verifiable Credential Smart Contract

This project contains the `UniversityVC` smart contract, which allows a university (or any trusted academic institution) to issue, revoke, and verify **Verifiable Credentials (VCs)** to students using their **DIDs** (Decentralized Identifiers). It supports IPFS storage for full credential metadata and enables cryptographic verification of credentials.

---

## 📦 Features

- 🔐 **Issuer-restricted credential issuance and revocation**
- 🧾 **Credential structure** includes student DID, credential type, metadata, hash, IPFS CID, and signature
- 🔍 **Credential verification** via hash checking and validity status
- 🧑‍🎓 **Credential retrieval by student DID**
- ☁️ **Integration with IPFS for decentralized credential storage**

---

## 🛠️ Smart Contract Details

- **Contract Name:** `UniversityVC`
- **Compiler Version:** `^0.8.0`
- **License:** MIT

### 🔗 Deployed Contract Addresses (Sepolia Testnet)

| Contract         | Address                                    |
|------------------|--------------------------------------------|
| UniversityVC 1   | `0xBe203f08DC55566fe826c6aAE8eb29cfE69Ae520` |
| UniversityVC 2   | `0x1fc7657EAE15be7d968044E36bdb14004d18Dae9` |
| UniversityVC 3   | `0xE2ff8118Bc145F03410F46728BaE0bF3f1C6EF81` |
| Local (Hardhat)  | `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707` |

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:

- Node.js
- Hardhat
- Infura account & project URL
- Etherscan API key

### 🔐 Environment Variables

Create a `.env` file in the root directory and include the following:

```env
INFURA_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
PRIVATE_KEY=YOUR_WALLET_PRIVATE_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY

Deploy
npx hardhat run scripts/deploy.js --network sepolia
npx hardhat verify --network sepolia 0xE2ff8118Bc145F03410F46728BaE0bF3f1C6EF81 "did:example:abyaUniversity"

