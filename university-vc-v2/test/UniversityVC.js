// test/UniversityVCV2.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("UniversityVCV2 (lite AccessControl)", function () {
  let UniversityVCV2, vc, admin, otherAccount, thirdAccount;

  // Helper: robust keccak256 over a UTF-8 string (works with ethers v5 & v6)
  function keccak256OfString(str) {
    // ethers v5: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(str))
    if (ethers.utils && typeof ethers.utils.keccak256 === "function" && typeof ethers.utils.toUtf8Bytes === "function") {
      return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(str));
    }
    // ethers v6 top-level helpers: ethers.keccak256(ethers.toUtf8Bytes(str))
    if (typeof ethers.keccak256 === "function" && typeof ethers.toUtf8Bytes === "function") {
      return ethers.keccak256(ethers.toUtf8Bytes(str));
    }
    // fallback: ethers.utils.id (keccak256 of string) if available
    if (ethers.utils && typeof ethers.utils.id === "function") {
      return ethers.utils.id(str);
    }
    if (typeof ethers.id === "function") {
      return ethers.id(str);
    }
    throw new Error("keccak256 not available from ethers");
  }

  // Cross-version ZERO_HASH fallback (works if ethers.constants.HashZero isn't present)
  const ZERO_HASH =
    (ethers.constants && ethers.constants.HashZero) ? ethers.constants.HashZero : "0x" + "0".repeat(64);

  beforeEach(async function () {
    [admin, otherAccount, thirdAccount] = await ethers.getSigners();
    UniversityVCV2 = await ethers.getContractFactory("UniversityVCV2");
    vc = await UniversityVCV2.deploy(admin.address);
    await vc.waitForDeployment();
  });

  it("should deploy with correct admin and initial issuer", async function () {
    expect(await vc.admin()).to.equal(admin.address);
    expect(await vc.issuers(admin.address)).to.equal(true);
  });

  it("should issue a credential with correct details", async function () {
    const holderDID = "did:example:chain:student123";
    const salt = "random-salt-1";
    const holderHash = keccak256OfString(holderDID + salt);

    const ipfsCID = "ipfs://QmExampleCid1";
    const credentialJWT = keccak256OfString(
      JSON.stringify({
        type: "Diploma",
        metadata: "BSc Computer Science",
      })
    );
    const expiresAt = 0;

    const tx = await vc.issueCredential(holderHash, ipfsCID, credentialJWT, expiresAt);

    await expect(tx)
      .to.emit(vc, "CredentialIssued")
      .withArgs(1, holderHash, ipfsCID, credentialJWT, anyValue, expiresAt);

    const summary = await vc.getCredentialSummary(1);
    const [
      id,
      retHolderHash,
      latestCID,
      retJWT,
      issuedAt,
      retExpiresAt,
      valid,
      revokedAt,
      revocationReason,
    ] = summary;

    expect(id).to.equal(1);
    expect(retHolderHash).to.equal(holderHash);
    expect(latestCID).to.equal(ipfsCID);
    expect(retJWT).to.equal(credentialJWT);
    expect(retExpiresAt).to.equal(expiresAt);
    expect(valid).to.equal(true);
    expect(issuedAt).to.be.gt(0);
    expect(revokedAt).to.equal(0);
    expect(revocationReason).to.equal("");
  });

  it("should add a CID version and return versions", async function () {
    const holderHash = keccak256OfString("did:example:chain:student123" + "salt2");
    const ipfsCID1 = "ipfs://QmCid1";
    const ipfsCID2 = "ipfs://QmCid2";
    const credentialJWT = keccak256OfString("credjson");
    const expiresAt = 0;

    await vc.issueCredential(holderHash, ipfsCID1, credentialJWT, expiresAt);
    const txAdd = await vc.addCIDVersion(1, ipfsCID2);

    await expect(txAdd)
      .to.emit(vc, "CredentialCIDVersionAdded")
      .withArgs(1, 1, ipfsCID2);

    const versions = await vc.getCIDVersions(1);
    expect(versions.length).to.equal(2);
    expect(versions[0]).to.equal(ipfsCID1);
    expect(versions[1]).to.equal(ipfsCID2);
  });

  it("should revoke a credential and reflect revocation metadata", async function () {
    const holderHash = keccak256OfString("did:example:chain:studentX" + "salt3");
    const ipfsCID = "ipfs://QmCidX";
    const credentialJWT = keccak256OfString("credX");
    await vc.issueCredential(holderHash, ipfsCID, credentialJWT, 0);

    const reason = "fraudulent";
    const txRevoke = await vc.revokeCredential(1, reason);

    await expect(txRevoke)
      .to.emit(vc, "CredentialRevoked")
      .withArgs(1, anyValue, reason);

    const summary = await vc.getCredentialSummary(1);
    const [, , , , , , valid, revokedAt, revocationReason] = summary;
    expect(valid).to.equal(false);
    expect(revokedAt).to.be.gt(0);
    expect(revocationReason).to.equal(reason);
  });

  it("should verify credentials correctly (valid, invalid hash, after revocation)", async function () {
    const holderHash = keccak256OfString("did:example:chain:studentY" + "salt4");
    const ipfsCID = "ipfs://QmCidY";
    const credentialJWT = keccak256OfString("credential-y");

    await vc.issueCredential(holderHash, ipfsCID, credentialJWT, 0);

    const ok = await vc.verifyCredential(1, credentialJWT);
    expect(ok).to.equal(true);

    const wrong = await vc.verifyCredential(1, keccak256OfString("wrong"));
    expect(wrong).to.equal(false);

    await vc.revokeCredential(1, "revoked for test");
    const okAfterRevoke = await vc.verifyCredential(1, credentialJWT);
    expect(okAfterRevoke).to.equal(false);
  });

  // ---------- New tests: Expiration ----------
  it("should respect expiration: verification fails after expiry", async function () {
    const holderHash = keccak256OfString("did:example:chain:studentExp" + "saltE");
    const ipfsCID = "ipfs://QmCidExp";
    const credentialJWT = keccak256OfString("credExp");

    // compute current block timestamp
    const block = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
    const now = block.timestamp;
    const expiresAt = now + 100; // expires in 100 seconds

    await vc.issueCredential(holderHash, ipfsCID, credentialJWT, expiresAt);

    // should be valid now
    expect(await vc.verifyCredential(1, credentialJWT)).to.equal(true);

    // move time forward beyond expiry
    await ethers.provider.send("evm_increaseTime", [200]);
    await ethers.provider.send("evm_mine", []);

    // now verification should fail due to expiry
    expect(await vc.verifyCredential(1, credentialJWT)).to.equal(false);
  });

  // ---------- New tests: Multiple issuers ----------
  it("should allow admin to grant/revoke issuer and allow issued actions by new issuer", async function () {
    // grant issuer role to otherAccount
    const grantTx = await vc.grantIssuer(otherAccount.address);
    await expect(grantTx).to.emit(vc, "IssuerRoleGranted").withArgs(otherAccount.address, admin.address);
    expect(await vc.issuers(otherAccount.address)).to.equal(true);

    // otherAccount should be able to issue
    const holderHash = keccak256OfString("did:example:multi:student" + "saltM");
    const ipfsCID = "ipfs://QmCidMulti";
    const jwt = keccak256OfString("multi-jwt");
    await vc.connect(otherAccount).issueCredential(holderHash, ipfsCID, jwt, 0);
    const summary = await vc.getCredentialSummary(1);
    expect(summary[2]).to.equal(ipfsCID);

    // revoke issuer role
    const revokeTx = await vc.revokeIssuer(otherAccount.address);
    await expect(revokeTx).to.emit(vc, "IssuerRoleRevoked").withArgs(otherAccount.address, admin.address);
    expect(await vc.issuers(otherAccount.address)).to.equal(false);

    // now otherAccount should NOT be able to issue
    await expect(
      vc.connect(otherAccount).issueCredential(keccak256OfString("x"), "ipfs://no", keccak256OfString("a"), 0)
    ).to.be.revertedWith("issuer only");
  });

  it("should prevent unauthorized accounts from issuing", async function () {
    // thirdAccount is not an issuer by default
    await expect(
      vc.connect(thirdAccount).issueCredential(keccak256OfString("foo"), "ipfs://no", keccak256OfString("a"), 0)
    ).to.be.revertedWith("issuer only");
  });

  // ---------- New tests: DID flows ----------
  it("should issue credential with plaintext DID and allow DID lookup", async function () {
    const holderDID = "did:example:plain:student1";
    const ipfsCID = "ipfs://QmDidCid1";
    const jwt = keccak256OfString("did-jwt-1");

    const tx = await vc.issueCredentialWithDID(holderDID, ipfsCID, jwt, 0);
    const didHash = keccak256OfString(holderDID);

    await expect(tx)
      .to.emit(vc, "CredentialIssued")
      .withArgs(1, didHash, ipfsCID, jwt, anyValue, 0);

    const ids = await vc.getCredentialsForDID(holderDID);
    expect(ids.length).to.equal(1);
    expect(ids[0]).to.equal(1);

    // getCredentialsForHolder should also return same id because we stored didHash in holderHash
    const holderResults = await vc.getCredentialsForHolder(didHash);
    expect(holderResults.length).to.equal(1);
    expect(holderResults[0]).to.equal(1);
  });

  it("should bind DID to salted holderHash and resolve DID -> salted entries", async function () {
    // create salted holderHash and issue a credential using the salted flow
    const holderDID = "did:example:bound:student2";
    const salt = "somesalt42";
    const saltedHolderHash = keccak256OfString(holderDID + salt);
    const ipfsCID = "ipfs://QmBoundCid";
    const jwt = keccak256OfString("bound-jwt");

    await vc.issueCredential(saltedHolderHash, ipfsCID, jwt, 0);

    // bind the plaintext DID to the salted holderHash
    const bindTx = await vc.bindDIDToHolderHash(holderDID, saltedHolderHash);
    await expect(bindTx).to.emit(vc, "DIDBound").withArgs(holderDID, saltedHolderHash);

    // check didToHolderHash mapping (call with didHash)
    const didHash = keccak256OfString(holderDID);
    const mapped = await vc.didToHolderHash(didHash);
    expect(mapped).to.equal(saltedHolderHash);

    // getCredentialsForDID should now resolve to the salted holder entries
    const ids = await vc.getCredentialsForDID(holderDID);
    expect(ids.length).to.equal(1);
    expect(ids[0]).to.equal(1);
  });

  it("should prevent non-issuers from binding DIDs", async function () {
    const holderDID = "did:example:unauth:student3";
    const saltedHolderHash = keccak256OfString(holderDID + "saltZ");
    await expect(vc.connect(otherAccount).bindDIDToHolderHash(holderDID, saltedHolderHash)).to.be.revertedWith(
      "issuer only"
    );
  });

  // ---------- New tests: Edge cases & input validation ----------
  it("should revert on invalid credential IDs for summary / versions / revoke / addCID", async function () {
    // invalid summary (0)
    await expect(vc.getCredentialSummary(0)).to.be.revertedWith("Invalid credential id");
    // invalid versions
    await expect(vc.getCIDVersions(999)).to.be.revertedWith("Invalid credential id");
    // invalid addCID
    await expect(vc.addCIDVersion(999, "ipfs://no")).to.be.revertedWith("Invalid credential id");
    // invalid revoke
    await expect(vc.revokeCredential(999, "nope")).to.be.revertedWith("Invalid credential id");
  });

  it("verifyCredential returns false for non-existent ids (no revert)", async function () {
    const dummyHash = keccak256OfString("doesntmatter");
    expect(await vc.verifyCredential(999, dummyHash)).to.equal(false);
    expect(await vc.verifyCredential(0, dummyHash)).to.equal(false);
  });

  it("should validate inputs when issuing (holderHash required, cid required)", async function () {
    const jwt = keccak256OfString("x");
    // holderHash zero
    await expect(vc.issueCredential(ZERO_HASH, "ipfs://ok", jwt, 0)).to.be.revertedWith("holderHash required");
    // empty cid
    await expect(vc.issueCredential(keccak256OfString("h"), "", jwt, 0)).to.be.revertedWith("cid required");
  });

  // ---------- New tests: Admin transfer ----------
  it("should transfer admin and enforce new admin permissions", async function () {
    // transfer admin to otherAccount
    const tx = await vc.transferAdmin(otherAccount.address);
    await expect(tx).to.emit(vc, "AdminTransferred").withArgs(admin.address, otherAccount.address);

    // admin variable updated and new admin becomes issuer
    expect(await vc.admin()).to.equal(otherAccount.address);
    expect(await vc.issuers(otherAccount.address)).to.equal(true);

    // old admin should no longer be able to call onlyAdmin functions
    await expect(vc.grantIssuer(thirdAccount.address)).to.be.revertedWith("admin only");

    // new admin can grant issuer
    await vc.connect(otherAccount).grantIssuer(thirdAccount.address);
    expect(await vc.issuers(thirdAccount.address)).to.equal(true);
  });

  // ---------- New tests: getRawCredential (admin-only) ----------
  it("should allow admin to fetch raw credential and prevent non-admin access", async function () {
    const holderHash = keccak256OfString("did:example:raw:student" + "saltR");
    const ipfsCID = "ipfs://QmRawCid";
    const jwt = keccak256OfString("raw-jwt");

    await vc.issueCredential(holderHash, ipfsCID, jwt, 0);

    // admin can fetch raw credential
    const raw = await vc.getRawCredential(1);
    // raw structure: id, holderHash, string[] ipfsCIDs, credentialJWT, issuedAt, expiresAt, valid, revokedAt, revocationReason
    expect(raw[0]).to.equal(1);
    expect(raw[1]).to.equal(holderHash);
    // ipfsCIDs returned as array (index 2)
    expect(raw[2][0]).to.equal(ipfsCID);
    expect(raw[3]).to.equal(jwt);

    // non-admin should not be allowed
    await expect(vc.connect(thirdAccount).getRawCredential(1)).to.be.revertedWith("admin only");
  });

  // ---------- New tests: Full lifecycle (issue -> addCID -> revoke -> verify false) ----------
  it("should follow a full lifecycle: issue -> addCID -> revoke -> verify false", async function () {
    const holderHash = keccak256OfString("did:example:lifecycle:student" + "saltL");
    const ipfsCID1 = "ipfs://QmLife1";
    const ipfsCID2 = "ipfs://QmLife2";
    const jwt = keccak256OfString("lifecycle-jwt");

    // issue
    await vc.issueCredential(holderHash, ipfsCID1, jwt, 0);

    // add second version
    await vc.addCIDVersion(1, ipfsCID2);
    const versions = await vc.getCIDVersions(1);
    expect(versions.length).to.equal(2);
    expect(versions[0]).to.equal(ipfsCID1);
    expect(versions[1]).to.equal(ipfsCID2);

    // revoke
    await vc.revokeCredential(1, "lifecycle revoke");

    // verify should now fail
    expect(await vc.verifyCredential(1, jwt)).to.equal(false);

    // summary should reflect revocation
    const summary = await vc.getCredentialSummary(1);
    expect(summary[6]).to.equal(false); // valid == false
    expect(summary[8]).to.equal("lifecycle revoke"); // revocationReason
  });
});
