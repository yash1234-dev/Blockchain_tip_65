import { expect } from "chai";
import { network } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";
import type { Contract, ContractTransactionResponse } from "ethers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";

const { ethers } = await network.create();

type Tip = { sender: string; amount: bigint; note: string; timestamp: bigint };

/**
 * `ethers.deployContract("PraiseBoard")` returns a generic `Contract`. This
 * narrows it to PraiseBoard's actual function surface (matching
 * contracts/PraiseBoard.sol) so the test file below type-checks under plain
 * `tsc`, without pulling in a full TypeChain codegen step for one contract.
 */
type PraiseBoardContract = Contract & {
  owner(): Promise<string>;
  tip(note: string, overrides?: { value?: bigint }): Promise<ContractTransactionResponse>;
  getTips(): Promise<Tip[]>;
  tipCount(): Promise<bigint>;
  getBalance(): Promise<bigint>;
  withdraw(): Promise<ContractTransactionResponse>;
};

function withSigner(contract: PraiseBoardContract, signer: HardhatEthersSigner): PraiseBoardContract {
  return contract.connect(signer) as PraiseBoardContract;
}

describe("PraiseBoard", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const deployed = await ethers.deployContract("PraiseBoard");
    const praiseBoard = deployed as unknown as PraiseBoardContract;
    return { praiseBoard, owner, alice, bob };
  }

  // 1. deployment sets owner
  it("sets the deployer as owner", async function () {
    const { praiseBoard, owner } = await deployFixture();
    expect(await praiseBoard.owner()).to.equal(owner.address);
  });

  // 2. valid tip succeeds
  it("accepts a valid tip", async function () {
    const { praiseBoard, alice } = await deployFixture();
    await expect(
      withSigner(praiseBoard, alice).tip("Thanks for keeping the timetable online!", {
        value: ethers.parseEther("0.01"),
      }),
    ).to.not.revert(ethers);
  });

  // 3. sender stored
  it("stores the sender's address on the tip", async function () {
    const { praiseBoard, alice } = await deployFixture();
    await withSigner(praiseBoard, alice).tip("Great work", { value: ethers.parseEther("0.01") });
    const tips = await praiseBoard.getTips();
    expect(tips[0].sender).to.equal(alice.address);
  });

  // 4. amount stored
  it("stores the exact tip amount", async function () {
    const { praiseBoard, alice } = await deployFixture();
    const value = ethers.parseEther("0.025");
    await withSigner(praiseBoard, alice).tip("Appreciate you", { value });
    const tips = await praiseBoard.getTips();
    expect(tips[0].amount).to.equal(value);
  });

  // 5. note stored
  it("stores the note text exactly", async function () {
    const { praiseBoard, alice } = await deployFixture();
    await withSigner(praiseBoard, alice)
      .tip("Bus was on time thanks to your timetable", { value: ethers.parseEther("0.01") });
    const tips = await praiseBoard.getTips();
    expect(tips[0].note).to.equal("Bus was on time thanks to your timetable");
  });

  // 6. timestamp stored
  it("stores a non-zero timestamp", async function () {
    const { praiseBoard, alice } = await deployFixture();
    await withSigner(praiseBoard, alice).tip("Thank you!", { value: ethers.parseEther("0.01") });
    const tips = await praiseBoard.getTips();
    expect(tips[0].timestamp).to.be.greaterThan(0n);
  });

  // 7. TipReceived emitted
  it("emits TipReceived with the correct sender, amount, and note", async function () {
    const { praiseBoard, alice } = await deployFixture();
    const value = ethers.parseEther("0.01");
    await expect(withSigner(praiseBoard, alice).tip("Nice work", { value }))
      .to.emit(praiseBoard, "TipReceived")
      .withArgs(alice.address, value, "Nice work", anyValue);
  });

  // 8. empty note rejected
  it("rejects a tip with an empty note", async function () {
    const { praiseBoard, alice } = await deployFixture();
    await expect(
      withSigner(praiseBoard, alice).tip("", { value: ethers.parseEther("0.01") }),
    ).to.be.revertedWithCustomError(praiseBoard, "EmptyNote");
  });

  // 9. >200-byte note rejected
  it("rejects a note longer than 200 bytes", async function () {
    const { praiseBoard, alice } = await deployFixture();
    const longNote = "a".repeat(201);
    await expect(withSigner(praiseBoard, alice).tip(longNote, { value: ethers.parseEther("0.01") }))
      .to.be.revertedWithCustomError(praiseBoard, "NoteTooLong")
      .withArgs(201n, 200n);
  });

  it("accepts a note that is exactly 200 bytes", async function () {
    const { praiseBoard, alice } = await deployFixture();
    const maxNote = "a".repeat(200);
    await expect(
      withSigner(praiseBoard, alice).tip(maxNote, { value: ethers.parseEther("0.01") }),
    ).to.not.revert(ethers);
  });

  // 10. zero-value tip rejected
  it("rejects a tip with zero value", async function () {
    const { praiseBoard, alice } = await deployFixture();
    await expect(
      withSigner(praiseBoard, alice).tip("Thanks", { value: 0n }),
    ).to.be.revertedWithCustomError(praiseBoard, "ZeroTip");
  });

  // 11. multiple tips stored
  it("stores multiple tips from different senders in order", async function () {
    const { praiseBoard, alice, bob } = await deployFixture();
    await withSigner(praiseBoard, alice).tip("First tip", { value: ethers.parseEther("0.01") });
    await withSigner(praiseBoard, bob).tip("Second tip", { value: ethers.parseEther("0.02") });

    const tips = await praiseBoard.getTips();
    expect(tips.length).to.equal(2);
    expect(tips[0].sender).to.equal(alice.address);
    expect(tips[0].note).to.equal("First tip");
    expect(tips[1].sender).to.equal(bob.address);
    expect(tips[1].note).to.equal("Second tip");
    expect(await praiseBoard.tipCount()).to.equal(2n);
  });

  // 12. anyone can read tips
  it("lets any account (including one that never tipped) read all tips", async function () {
    const { praiseBoard, alice, bob } = await deployFixture();
    await withSigner(praiseBoard, alice).tip("Hello", { value: ethers.parseEther("0.01") });

    const tips = await withSigner(praiseBoard, bob).getTips();
    expect(tips.length).to.equal(1);
    expect(tips[0].note).to.equal("Hello");
  });

  // 13. owner can withdraw
  it("lets the owner withdraw the accumulated balance", async function () {
    const { praiseBoard, owner, alice } = await deployFixture();
    const value = ethers.parseEther("0.05");
    await withSigner(praiseBoard, alice).tip("Big thanks", { value });

    const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
    const tx = await withSigner(praiseBoard, owner).withdraw();
    const receipt = await tx.wait();
    const gasCost = receipt!.gasUsed * receipt!.gasPrice;

    const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
    expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + value - gasCost);
    expect(await praiseBoard.getBalance()).to.equal(0n);
  });

  // 14. non-owner cannot withdraw
  it("reverts when a non-owner tries to withdraw", async function () {
    const { praiseBoard, alice } = await deployFixture();
    await withSigner(praiseBoard, alice).tip("Thanks", { value: ethers.parseEther("0.01") });

    await expect(withSigner(praiseBoard, alice).withdraw()).to.be.revertedWithCustomError(
      praiseBoard,
      "NotOwner",
    );
  });

  // 15. withdrawal transfers accumulated ETH correctly (multiple tips)
  it("withdraws the full accumulated balance across multiple tips", async function () {
    const { praiseBoard, owner, alice, bob } = await deployFixture();
    await withSigner(praiseBoard, alice).tip("Tip one", { value: ethers.parseEther("0.01") });
    await withSigner(praiseBoard, bob).tip("Tip two", { value: ethers.parseEther("0.03") });

    const contractBalance = await praiseBoard.getBalance();
    expect(contractBalance).to.equal(ethers.parseEther("0.04"));

    const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
    const tx = await withSigner(praiseBoard, owner).withdraw();
    const receipt = await tx.wait();
    const gasCost = receipt!.gasUsed * receipt!.gasPrice;
    const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

    expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + contractBalance - gasCost);
    expect(await praiseBoard.getBalance()).to.equal(0n);
  });

  it("reverts withdraw with nothing to withdraw when balance is zero", async function () {
    const { praiseBoard, owner } = await deployFixture();
    await expect(withSigner(praiseBoard, owner).withdraw()).to.be.revertedWithCustomError(
      praiseBoard,
      "NothingToWithdraw",
    );
  });

  it("emits Withdrawn with the correct owner and amount", async function () {
    const { praiseBoard, owner, alice } = await deployFixture();
    const value = ethers.parseEther("0.01");
    await withSigner(praiseBoard, alice).tip("Thanks", { value });

    await expect(withSigner(praiseBoard, owner).withdraw())
      .to.emit(praiseBoard, "Withdrawn")
      .withArgs(owner.address, value);
  });

  it("rejects a plain ETH transfer that does not go through tip()", async function () {
    const { praiseBoard, alice } = await deployFixture();
    const address = await praiseBoard.getAddress();
    await expect(
      alice.sendTransaction({ to: address, value: ethers.parseEther("0.01") }),
    ).to.revert(ethers);
  });
});
