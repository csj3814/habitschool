// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./HaBit.sol";

/**
 * @title HaBitStaking — 챌린지 예치 컨트랙트
 * @notice 3일/7일/30일 건강 습관 챌린지의 HBT 예치 및 정산
 * 
 * 규칙:
 * - 3일 미니: 예치 없음, 포인트만 보상
 * - 7일 위클리: HBT 예치, 80%+ 환급+보너스, 100% 시 +50% HBT
 * - 30일 마스터: HBT 예치, 80%+ 환급, 100% 시 +100% HBT
 * - 미달 시: 예치금 50% 소각, 50% 반환
 */
contract HaBitStaking is Ownable {

    HaBit public hbtToken;

    struct Challenge {
        address user;
        string challengeId;
        uint256 stakedAmount;
        uint256 startTime;
        uint256 endTime;
        uint8 totalDays;
        uint8 completedDays;
        bool settled;
    }

    // 사용자별 활성 챌린지 (tier => challenge)
    // tier: 0 = mini, 1 = weekly, 2 = master
    mapping(address => mapping(uint8 => Challenge)) public activeChallenges;
    
    // 전체 챌린지 통계
    uint256 public totalStaked;
    uint256 public totalSlashed;
    uint256 public totalReturned;
    uint256 public challengeCount;

    // 승인된 운영자 (서버)
    mapping(address => bool) public operators;

    event ChallengeStarted(address indexed user, string challengeId, uint8 tier, uint256 staked);
    event ChallengeSettled(address indexed user, string challengeId, uint8 completedDays, uint8 totalDays, uint256 reward);
    event ChallengeSlashed(address indexed user, string challengeId, uint256 burned, uint256 returned);

    error NotOperator();
    error ChallengeAlreadyActive();
    error NoChallengeActive();
    error ChallengeNotEnded();
    error AlreadySettled();
    error InsufficientStake();

    modifier onlyOperator() {
        if (!operators[msg.sender] && msg.sender != owner()) {
            revert NotOperator();
        }
        _;
    }

    constructor(address _hbtToken) Ownable(msg.sender) {
        hbtToken = HaBit(_hbtToken);
    }

    /**
     * @notice 챌린지 시작 — 사용자가 HBT 예치
     * @param user 사용자 주소
     * @param challengeId 챌린지 ID 문자열
     * @param tier 0=mini, 1=weekly, 2=master
     * @param totalDays 챌린지 기간 (3, 7, 30)
     * @param stakeAmount 예치 HBT (mini는 0)
     */
    function startChallenge(
        address user,
        string calldata challengeId,
        uint8 tier,
        uint8 totalDays,
        uint256 stakeAmount
    ) external onlyOperator {
        if (activeChallenges[user][tier].stakedAmount > 0 && !activeChallenges[user][tier].settled) {
            revert ChallengeAlreadyActive();
        }

        if (stakeAmount > 0) {
            // 사용자가 미리 이 컨트랙트에 approve 해야 함
            hbtToken.transferFrom(user, address(this), stakeAmount);
            totalStaked += stakeAmount;
        }

        activeChallenges[user][tier] = Challenge({
            user: user,
            challengeId: challengeId,
            stakedAmount: stakeAmount,
            startTime: block.timestamp,
            endTime: block.timestamp + (uint256(totalDays) * 1 days),
            totalDays: totalDays,
            completedDays: 0,
            settled: false
        });

        challengeCount++;
        emit ChallengeStarted(user, challengeId, tier, stakeAmount);
    }

    /**
     * @notice 일일 인증 기록 업데이트
     * @param user 사용자 주소
     * @param tier 챌린지 티어
     */
    function recordDay(address user, uint8 tier) external onlyOperator {
        Challenge storage c = activeChallenges[user][tier];
        if (c.settled || c.stakedAmount == 0 && c.totalDays == 0) revert NoChallengeActive();
        if (c.completedDays < c.totalDays) {
            c.completedDays++;
        }
    }

    /**
     * @notice 챌린지 정산 (기간 종료 후)
     * @param user 사용자 주소
     * @param tier 챌린지 티어
     */
    function settleChallenge(address user, uint8 tier) external onlyOperator {
        Challenge storage c = activeChallenges[user][tier];
        if (c.settled) revert AlreadySettled();
        if (c.totalDays == 0) revert NoChallengeActive();

        c.settled = true;
        uint256 staked = c.stakedAmount;

        if (staked == 0) {
            // 미니 챌린지 (예치 없음) — 포인트 보상은 오프체인
            emit ChallengeSettled(user, c.challengeId, c.completedDays, c.totalDays, 0);
            return;
        }

        uint256 successRate = (uint256(c.completedDays) * 100) / uint256(c.totalDays);

        if (successRate == 100) {
            // 100% 달성: 원금 + 보너스 (tier에 따라 50% 또는 100%)
            uint256 bonusRate = tier == 2 ? 100 : 50; // master: +100%, weekly: +50%
            uint256 bonus = (staked * bonusRate) / 100;
            uint256 totalReward = staked + bonus;

            hbtToken.transfer(user, staked);
            // 보너스는 운영자가 별도 mint
            totalReturned += staked;

            emit ChallengeSettled(user, c.challengeId, c.completedDays, c.totalDays, totalReward);
        } else if (successRate >= 80) {
            // 80%+: 원금 환급만
            hbtToken.transfer(user, staked);
            totalReturned += staked;

            emit ChallengeSettled(user, c.challengeId, c.completedDays, c.totalDays, staked);
        } else {
            // 미달: 50% 소각, 50% 반환
            uint256 burnAmount = staked / 2;
            uint256 returnAmount = staked - burnAmount;

            hbtToken.burn(burnAmount, "challenge_slash");
            hbtToken.transfer(user, returnAmount);

            totalSlashed += burnAmount;
            totalReturned += returnAmount;

            emit ChallengeSlashed(user, c.challengeId, burnAmount, returnAmount);
        }
    }

    /**
     * @notice 운영자 권한 설정
     */
    function setOperator(address operator, bool authorized) external onlyOwner {
        operators[operator] = authorized;
    }

    /**
     * @notice 활성 챌린지 조회
     */
    function getChallenge(address user, uint8 tier) external view returns (
        string memory challengeId,
        uint256 stakedAmount,
        uint8 completedDays,
        uint8 totalDays,
        bool settled
    ) {
        Challenge storage c = activeChallenges[user][tier];
        return (c.challengeId, c.stakedAmount, c.completedDays, c.totalDays, c.settled);
    }
}
