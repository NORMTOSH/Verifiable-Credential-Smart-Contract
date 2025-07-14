const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("UniversityVC Enhanced", function () {
  let UniversityVC, vc, issuer, otherAccount;
  const issuerDID = "did:example:abyaUniversity";

  beforeEach(async function () {
    // Get signers and deploy the contract
    [issuer, otherAccount] = await ethers.getSigners();
    UniversityVC = await ethers.getContractFactory("UniversityVC");
    vc = await UniversityVC.deploy(issuerDID);
    await vc.waitForDeployment();
  });

  it("should deploy with correct issuer and issuerDID", async function () {
    expect(await vc.issuer()).to.equal(issuer.address);
    expect(await vc.issuerDID()).to.equal(issuerDID);
  });

  it("should issue a credential with correct details", async function () {
    // Credential details
    const studentDID = "did:example:student123";
    const credentialType = "Diploma";
    const metadata = "Bachelor of Science in Computer Science, Grade A";
    const credentialHash = "hash123";
    const signature = "signature123";

    // Issue the credential and verify event emission using chai matchers
    const tx = await vc.issueCredential(
      studentDID,
      credentialType,
      metadata,
      credentialHash,
      signature
    );

    await expect(tx)
      .to.emit(vc, "CredentialIssued")
      .withArgs(1, studentDID, credentialType, anyValue, credentialHash, signature);

    // Retrieve and check the credential record
    const cred = await vc.credentials(1);
    expect(cred.id).to.equal(1);
    expect(cred.studentDID).to.equal(studentDID);
    expect(cred.issuerDID).to.equal(issuerDID);
    expect(cred.credentialType).to.equal(credentialType);
    expect(cred.metadata).to.equal(metadata);
    expect(cred.credentialHash).to.equal(credentialHash);
    expect(cred.signature).to.equal(signature);
    expect(cred.valid).to.equal(true);
    // Check that issueDate has been set (non-zero timestamp)
    expect(cred.issueDate).to.be.gt(0);
  });

  it("should revoke a credential", async function () {
    // Issue a credential first
    const studentDID = "did:example:student123";
    const credentialType = "Diploma";
    const metadata = "Bachelor of Science in Computer Science, Grade A";
    const credentialHash = "hash123";
    const signature = "signature123";

    const txIssue = await vc.issueCredential(
      studentDID,
      credentialType,
      metadata,
      credentialHash,
      signature
    );
    await txIssue.wait();

    // Revoke the credential
    const txRevoke = await vc.revokeCredential(1);
    await txRevoke.wait();

    // Check that the credential is marked as invalid
    const cred = await vc.credentials(1);
    expect(cred.valid).to.equal(false);
  });

  it("should verify a credential correctly", async function () {
    // Issue a credential
    const studentDID = "did:example:student123";
    const credentialType = "Diploma";
    const metadata = "Bachelor of Science in Computer Science, Grade A";
    const credentialHash = "hash123";
    const signature = "signature123";

    const txIssue = await vc.issueCredential(
      studentDID,
      credentialType,
      metadata,
      credentialHash,
      signature
    );
    await txIssue.wait();

    // Verify with correct hash
    const validCheck = await vc.verifyCredential(1, credentialHash);
    expect(validCheck).to.equal(true);

    // Verify with incorrect hash
    const invalidCheck = await vc.verifyCredential(1, "wronghash");
    expect(invalidCheck).to.equal(false);

    // Revoke the credential and check verification
    const txRevoke = await vc.revokeCredential(1);
    await txRevoke.wait();
    const validAfterRevocation = await vc.verifyCredential(1, credentialHash);
    expect(validAfterRevocation).to.equal(false);
  });
});
