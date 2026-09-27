// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PraiseBoard
/// @notice A public tip jar with notes for Ifeoma's bus timetable service.
/// @dev The blockchain is the only source of truth: every valid tip is pushed
///      into on-chain storage and emitted as an event. There is no off-chain
///      database, and the frontend cannot fabricate or edit an entry - it can
///      only read what this contract stored. The contract is deliberately
///      small and auditable: one struct, one array, one event, three state-
///      changing functions.
contract PraiseBoard {
    /// @notice Maximum allowed length of a tip note, in bytes (UTF-8 encoded).
    uint256 public constant MAX_NOTE_BYTES = 200;

    /// @notice The address that deployed this contract (Ifeoma). Set once, at
    /// deployment, and immutable afterwards. Only this address may withdraw
    /// the accumulated tips.
    address public immutable owner;

    /// @notice One recorded tip.
    struct Tip {
        address sender;
        uint256 amount;
        string note;
        uint256 timestamp;
    }

    /// @dev Every valid tip ever received, in the order it was received.
    Tip[] private tips;

    /// @notice Emitted every time a valid tip is recorded.
    event TipReceived(address indexed sender, uint256 amount, string note, uint256 timestamp);

    /// @notice Emitted when the owner withdraws the contract balance.
    event Withdrawn(address indexed owner, uint256 amount);

    error NotOwner();
    error ZeroTip();
    error EmptyNote();
    error NoteTooLong(uint256 length, uint256 maxLength);
    error NothingToWithdraw();
    error WithdrawFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Send a tip with a short public note.
    /// @param note A non-empty note, at most MAX_NOTE_BYTES bytes long.
    /// @dev Reverts with ZeroTip if no ETH is sent, EmptyNote if the note is
    /// empty, or NoteTooLong if the note exceeds MAX_NOTE_BYTES bytes. On
    /// success the tip is pushed to on-chain storage and TipReceived is
    /// emitted - this is the only way a tip can ever appear on the wall.
    function tip(string calldata note) external payable {
        if (msg.value == 0) revert ZeroTip();

        uint256 noteLength = bytes(note).length;
        if (noteLength == 0) revert EmptyNote();
        if (noteLength > MAX_NOTE_BYTES) revert NoteTooLong(noteLength, MAX_NOTE_BYTES);

        tips.push(Tip({sender: msg.sender, amount: msg.value, note: note, timestamp: block.timestamp}));

        emit TipReceived(msg.sender, msg.value, note, block.timestamp);
    }

    /// @notice Returns every tip ever recorded, oldest first. Anyone may call
    /// this - reading the wall never requires a transaction or a fee.
    function getTips() external view returns (Tip[] memory) {
        return tips;
    }

    /// @notice Number of tips recorded so far.
    function tipCount() external view returns (uint256) {
        return tips.length;
    }

    /// @notice Current ETH balance held by the contract.
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Withdraws the entire contract balance to the owner. Reverts
    /// if called by anyone else, or if there is nothing to withdraw.
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToWithdraw();

        (bool success, ) = payable(owner).call{value: balance}("");
        if (!success) revert WithdrawFailed();

        emit Withdrawn(owner, balance);
    }

    /// @dev Plain ETH transfers are rejected so every tip goes through
    /// tip(note) and is guaranteed to carry a note and be recorded.
    receive() external payable {
        revert("Use tip(note) to send a tip");
    }
}
