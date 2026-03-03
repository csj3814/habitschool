/**
 * HaBit (HBT) 배포 스크립트
 * 
 * 사용법:
 *   1. contracts/.env 파일 생성 (DEPLOYER_PRIVATE_KEY 필수)
 *   2. cd contracts && npm install
 *   3. npx hardhat compile
 *   4. npx hardhat run scripts/deploy.js --network baseSepolia
 * 
 * 배포 순서:
 *   1. HaBit.sol (ERC-20 토큰)
 *   2. HaBitStaking.sol (챌린지 예치)
 *   3. 서버 민터 권한 설정
 */

const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    
    console.log("========================================");
    console.log("🚀 HaBit (HBT) 배포 시작");
    console.log("========================================");
    console.log(`배포자: ${deployer.address}`);
    console.log(`네트워크: ${hre.network.name}`);
    console.log(`잔액: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH`);
    console.log("----------------------------------------");

    // 1. HaBit 토큰 배포
    console.log("\n📦 1/3: HaBit (HBT) 토큰 배포 중...");
    const HaBit = await hre.ethers.getContractFactory("HaBit");
    const habit = await HaBit.deploy();
    await habit.waitForDeployment();
    const habitAddress = await habit.getAddress();
    console.log(`✅ HaBit 배포 완료: ${habitAddress}`);

    // 2. HaBitStaking 배포
    console.log("\n📦 2/3: HaBitStaking 배포 중...");
    const HaBitStaking = await hre.ethers.getContractFactory("HaBitStaking");
    const staking = await HaBitStaking.deploy(habitAddress);
    await staking.waitForDeployment();
    const stakingAddress = await staking.getAddress();
    console.log(`✅ HaBitStaking 배포 완료: ${stakingAddress}`);

    // 3. 서버 민터 권한 설정
    const serverMinter = process.env.SERVER_MINTER_ADDRESS;
    if (serverMinter && serverMinter !== "0x0000000000000000000000000000000000000000") {
        console.log("\n🔑 3/3: 서버 민터 권한 설정 중...");
        
        // HaBit에 민터 권한 부여
        const tx1 = await habit.setMinter(serverMinter, true);
        await tx1.wait();
        console.log(`✅ HaBit 민터 설정: ${serverMinter}`);

        // Staking에 운영자 권한 부여
        const tx2 = await staking.setOperator(serverMinter, true);
        await tx2.wait();
        console.log(`✅ Staking 운영자 설정: ${serverMinter}`);
    } else {
        console.log("\n⚠️ 3/3: SERVER_MINTER_ADDRESS 미설정 — 나중에 수동 설정 필요");
    }

    // 결과 요약
    console.log("\n========================================");
    console.log("🎉 배포 완료!");
    console.log("========================================");
    console.log(`HaBit (HBT):     ${habitAddress}`);
    console.log(`HaBitStaking:    ${stakingAddress}`);
    console.log(`네트워크:         ${hre.network.name}`);
    
    const explorerBase = hre.network.name === "base" 
        ? "https://basescan.org" 
        : "https://sepolia.basescan.org";
    console.log(`\n🔍 탐색기:`);
    console.log(`   HaBit:    ${explorerBase}/address/${habitAddress}`);
    console.log(`   Staking:  ${explorerBase}/address/${stakingAddress}`);

    // blockchain-config.js 업데이트 안내
    console.log("\n📝 다음 단계:");
    console.log("   js/blockchain-config.js 에 아래 주소를 입력하세요:");
    console.log(`   testnetAddress: '${habitAddress}'`);
    console.log(`   stakingTestnet: '${stakingAddress}'`);
    console.log("========================================");

    // 배포 정보 파일 저장
    const deployInfo = {
        network: hre.network.name,
        chainId: hre.network.config.chainId,
        deployer: deployer.address,
        contracts: {
            HaBit: habitAddress,
            HaBitStaking: stakingAddress
        },
        timestamp: new Date().toISOString()
    };

    const fs = require("fs");
    fs.writeFileSync(
        `deployments-${hre.network.name}.json`,
        JSON.stringify(deployInfo, null, 2)
    );
    console.log(`\n💾 배포 정보 저장: deployments-${hre.network.name}.json`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 배포 실패:", error);
        process.exit(1);
    });
