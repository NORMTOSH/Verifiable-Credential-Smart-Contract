// test/test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");


describe("PresentationRegistry", function () {
  let Presentation;
  let registry;
  let deployer, addr1, addr2;

  beforeEach(async function () {
    [deployer, addr1, addr2] = await ethers.getSigners();
    Presentation = await ethers.getContractFactory("PresentationRegistry");
    registry = await Presentation.deploy();
    await registry.deployed();
  });

  it("deploys and has owner set", async function () {
    const owner = await registry.owner();
    expect(owner).to.equal(deployer.address);
    expect(await registry.presentationCount()).to.equal(0);
  });

  it("createPresentation stores a presentation and indexes by holderDid", async function () {
    const holderDid = "did:example:0xHolder";
    const mappingCID = "QmTestCid123";
    const vpJwt = "dummy.vp.jwt";
    const vpJwtHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(vpJwt));

    const tx = await registry.createPresentation(holderDid, mappingCID, vpJwtHash, 0);
    await tx.wait();

    expect(await registry.presentationCount()).to.equal(1);

    // read back via public mapping getter
    const p = await registry.presentations(1);
    expect(p.id).to.equal(1);
    expect(p.holderDid).to.equal(holderDid);
    expect(p.mappingCID).to.equal(mappingCID);
    expect(p.vpJwtHash).to.equal(vpJwtHash);
    expect(p.relatedCredentialId).to.equal(0);
    expect(p.revoked).to.equal(false);

    // getPresentationsForHolder should return [1]
    const ids = await registry.getPresentationsForHolder(holderDid);
    expect(ids.length).to.equal(1);
    expect(ids[0]).to.equal(1);
  });

  it("owner can revoke, non-owner cannot; transferOwnership works", async function () {
    const holderDidA = "did:example:holderA";
    const holderDidB = "did:example:holderB";
    const vpHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("jwtA"));
    const vpHashB = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("jwtB"));

    // create first presentation (id = 1)
    await (await registry.createPresentation(holderDidA, "QmCidA", vpHash, 0)).wait();
    expect((await registry.presentations(1)).revoked).to.equal(false);

    // owner (deployer) revokes id=1
    await (await registry.revokePresentation(1)).wait();
    expect((await registry.presentations(1)).revoked).to.equal(true);

    // create second presentation (id = 2)
    await (await registry.createPresentation(holderDidB, "QmCidB", vpHashB, 0)).wait();
    expect((await registry.presentations(2)).revoked).to.equal(false);

    // transfer ownership to addr1
    await (await registry.transferOwnership(addr1.address)).wait();
    expect(await registry.owner()).to.equal(addr1.address);

    // old owner (deployer) should NOT be able to revoke id=2 now
    await expect(registry.revokePresentation(2)).to.be.revertedWith("only owner");

    // new owner (addr1) can revoke id=2
    await (await registry.connect(addr1).revokePresentation(2)).wait();
    expect((await registry.presentations(2)).revoked).to.equal(true);
  });

  it("createPresentation returns increasing ids and emits event", async function () {
    const holder = "did:example:eventHolder";
    const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("jwtEvent"));
    await expect(registry.createPresentation(holder, "QmCidEvt", hash, 42))
      .to.emit(registry, "PresentationCreated")
      .withArgs(1, holder, "QmCidEvt", hash, 42, anyValue);

    // Helper for anyValue: fallback for timestamp; ethers@6 provides "anyValue" matcher via @nomicfoundation/hardhat-chai-matchers
    // If not available, just assert count turned to 1:
    expect(await registry.presentationCount()).to.equal(1);
  });

  it("getPresentation returns expected tuple", async function () {
    const holder = "did:example:tuple";
    const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("jwtTuple"));
    await (await registry.createPresentation(holder, "QmCidTuple", hash, 11)).wait();

    const tuple = await registry.getPresentation(1);
    // getPresentation returns (id, holderDid, mappingCID, vpJwtHash, relatedCredentialId, createdAt, revoked)
    expect(tuple[0]).to.equal(1);
    expect(tuple[1]).to.equal(holder);
    expect(tuple[2]).to.equal("QmCidTuple");
    expect(tuple[3]).to.equal(hash);
    expect(tuple[4]).to.equal(11);
    expect(tuple[6]).to.equal(false);
  });
});
