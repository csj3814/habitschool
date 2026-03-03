// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title HaBit (HBT) Token
 * @notice ERC-20 토큰 — 건강 습관 인증 채굴 + 비트코인 방식 무한 반감기
 * @dev Base 체인 배포, 8 decimals (BTC 호환)
 * 
 * 핵심 메커니즘:
 * - 최대 발행량: 100,000,000 HBT (하드캡)
 * - 채굴 풀: 60,000,000 HBT (60%)
 * - 비트코인 방식 무한 반감기: 구간 1(3천만) → 구간 2(1500만) → ... ÷2 무한
 * - 최소 전환율: 100P = 1 HBT (바닥, 절대 0 아님)
 * - 소각: 챌린지 실패 50%, 교환 수수료 2%
 */
contract HaBit is ERC20, Ownable {

    // ============ 상수 ============
    uint8 private constant _DECIMALS = 8;
    uint256 public constant MAX_SUPPLY = 100_000_000 * 10**_DECIMALS;        // 1억 HBT
    uint256 public constant MINING_POOL = 60_000_000 * 10**_DECIMALS;        // 6천만 HBT (채굴용)
    uint256 public constant ERA1_THRESHOLD = 30_000_000 * 10**_DECIMALS;     // 구간 1: 3천만 HBT
    uint256 public constant INITIAL_RATE = 100;     // 구간 1: 100P = 100 HBT (rate = 100)
    uint256 public constant MIN_RATE = 1;           // 최소: 100P = 1 HBT
    uint256 public constant EXCHANGE_BURN_FEE = 200; // 2% (basis points: 200/10000)

    // ============ 상태 변수 ============
    uint256 public totalMintedFromMining;    // 누적 채굴 발행량
    uint256 public totalBurned;              // 누적 소각량
    
    // 승인된 민터 (서버 지갑)
    mapping(address => bool) public authorizedMinters;

    // ============ 이벤트 ============
    event HabitMined(address indexed user, uint256 pointsUsed, uint256 hbtMinted, uint256 era);
    event TokensBurned(address indexed from, uint256 amount, string reason);
    event ChallengeSlashed(address indexed user, uint256 staked, uint256 burned, uint256 returned);
    event MinterUpdated(address indexed minter, bool authorized);

    // ============ 에러 ============
    error ExceedsMaxSupply();
    error ExceedsMiningPool();
    error NotAuthorizedMinter();
    error InsufficientBalance();
    error ZeroAmount();

    // ============ 수정자 ============
    modifier onlyMinter() {
        if (!authorizedMinters[msg.sender] && msg.sender != owner()) {
            revert NotAuthorizedMinter();
        }
        _;
    }

    // ============ 생성자 ============
    constructor() ERC20("HaBit", "HBT") Ownable(msg.sender) {
        // 초기 발행 없음 — 전량 채굴
    }

    // ============ ERC-20 오버라이드 ============
    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    // ============ 반감기 로직 ============

    /**
     * @notice 현재 전환 비율 계산 (비트코인 방식 무한 반감기)
     * @return rate 100P당 HBT 수량
     * @return era 현재 구간 번호 (1부터)
     */
    function getConversionRate() public view returns (uint256 rate, uint256 era) {
        uint256 minted = totalMintedFromMining;
        rate = INITIAL_RATE;
        era = 1;
        uint256 threshold = ERA1_THRESHOLD;

        while (minted >= threshold && rate > MIN_RATE) {
            minted -= threshold;
            threshold = threshold / 2;
            rate = rate / 2;
            era++;
            if (threshold == 0) break;
        }

        if (rate < MIN_RATE) {
            rate = MIN_RATE;
        }
    }

    /**
     * @notice 현재 구간에서 남은 채굴 가능량
     * @return remaining 현재 구간 잔여 HBT (raw units)
     */
    function remainingInCurrentEra() public view returns (uint256 remaining) {
        uint256 minted = totalMintedFromMining;
        uint256 threshold = ERA1_THRESHOLD;

        while (minted >= threshold && threshold > 0) {
            minted -= threshold;
            threshold = threshold / 2;
        }

        remaining = threshold > minted ? threshold - minted : 0;
    }

    // ============ 채굴 (Minting) ============

    /**
     * @notice 습관 인증 포인트를 HBT로 변환 (서버가 호출)
     * @param to 사용자 지갑 주소
     * @param pointAmount 사용한 포인트 (100 단위)
     */
    function habitMine(address to, uint256 pointAmount) external onlyMinter {
        if (pointAmount == 0) revert ZeroAmount();

        (uint256 rate, uint256 era) = getConversionRate();
        
        // HBT 계산: pointAmount * rate / 100 (rate는 100P당 HBT)
        uint256 hbtAmount = (pointAmount * rate * 10**_DECIMALS) / 100;

        // 채굴 풀 한도 체크
        if (totalMintedFromMining + hbtAmount > MINING_POOL) {
            revert ExceedsMiningPool();
        }

        // 최대 발행량 체크
        if (totalSupply() + hbtAmount > MAX_SUPPLY) {
            revert ExceedsMaxSupply();
        }

        totalMintedFromMining += hbtAmount;
        _mint(to, hbtAmount);

        emit HabitMined(to, pointAmount, hbtAmount, era);
    }

    /**
     * @notice 운영자가 비채굴 물량 발행 (시즌 보상, 보너스 등)
     * @param to 받을 주소
     * @param amount 발행량 (raw units, decimals 포함)
     */
    function operationalMint(address to, uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (totalSupply() + amount > MAX_SUPPLY) {
            revert ExceedsMaxSupply();
        }
        _mint(to, amount);
    }

    // ============ 소각 (Burn) ============

    /**
     * @notice 토큰 소각 (사용자가 직접 호출 또는 승인된 민터)
     * @param amount 소각할 수량
     * @param reason 소각 사유
     */
    function burn(uint256 amount, string calldata reason) external {
        if (amount == 0) revert ZeroAmount();
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance();

        _burn(msg.sender, amount);
        totalBurned += amount;

        emit TokensBurned(msg.sender, amount, reason);
    }

    /**
     * @notice 챌린지 실패 시 예치금 처리 (50% 소각 + 50% 반환)
     * @param user 사용자 주소
     * @param stakedAmount 예치된 HBT 수량
     */
    function slashChallenge(address user, uint256 stakedAmount) external onlyMinter {
        if (stakedAmount == 0) revert ZeroAmount();

        uint256 burnAmount = stakedAmount / 2;
        uint256 returnAmount = stakedAmount - burnAmount;

        // 소각
        _burn(address(this), burnAmount);
        totalBurned += burnAmount;

        // 반환
        _transfer(address(this), user, returnAmount);

        emit ChallengeSlashed(user, stakedAmount, burnAmount, returnAmount);
    }

    /**
     * @notice 교환 시 2% 소각 수수료 차감
     * @param from 교환 요청자
     * @param amount 교환할 HBT 총량
     * @return netAmount 수수료 차감 후 순 교환량
     */
    function exchangeWithBurn(address from, uint256 amount) external onlyMinter returns (uint256 netAmount) {
        if (amount == 0) revert ZeroAmount();
        if (balanceOf(from) < amount) revert InsufficientBalance();

        uint256 fee = (amount * EXCHANGE_BURN_FEE) / 10000;
        netAmount = amount - fee;

        // 수수료 소각
        _burn(from, fee);
        totalBurned += fee;

        emit TokensBurned(from, fee, "exchange_fee");
    }

    // ============ 관리자 기능 ============

    /**
     * @notice 민터 권한 설정
     * @param minter 민터 주소
     * @param authorized 승인 여부
     */
    function setMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
        emit MinterUpdated(minter, authorized);
    }

    // ============ 조회 기능 ============

    /**
     * @notice 전체 통계 조회
     */
    function getTokenStats() external view returns (
        uint256 _totalSupply,
        uint256 _totalMined,
        uint256 _totalBurned,
        uint256 _circulatingSupply,
        uint256 _currentRate,
        uint256 _currentEra,
        uint256 _remainingInEra
    ) {
        (_currentRate, _currentEra) = getConversionRate();
        _totalSupply = totalSupply();
        _totalMined = totalMintedFromMining;
        _totalBurned = totalBurned;
        _circulatingSupply = _totalSupply; // 소각분은 이미 totalSupply에서 제외됨
        _remainingInEra = remainingInCurrentEra();
    }
}
