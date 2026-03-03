/**
 * HaBitStaking 단독 배포 스크립트 (HaBit 토큰 이미 배포된 상태)
 */
const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const habitAddress = "0xCa499c14afE8B80E86D9e382AFf76f9f9c4e2E29";
    
    console.log("📦 HaBitStaking 배포 중...");
    console.log(`배포자: ${deployer.address}`);
    console.log(`HaBit 토큰: ${habitAddress}`);
    console.log(`잔액: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH`);

    const HaBitStaking = await hre.ethers.getContractFactory("HaBitStaking");
    const staking = await HaBitStaking.deploy(habitAddress);
    await staking.waitForDeployment();
    const stakingAddress = await staking.getAddress();
    console.log(`✅ HaBitStaking 배포 완료: ${stakingAddress}`);

    // 서버 민터 권한 설정
    const serverMinter = process.env.SERVER_MINTER_ADDRESS;
    if (serverMinter) {
        // HaBit에 민터 권한 (이미 배포된 컨트랙트에 연결)
        const HaBit = await hre.ethers.getContractFactory("HaBit");
        const habit = HaBit.attach(habitAddress);
        
        const tx1 = await habit.setMinter(serverMinter, true);
        await tx1.wait();
        console.log(`✅ HaBit 민터 설정: ${serverMinter}`);

        const tx2 = await staking.setOperator(serverMinter, true);
        await tx2.wait();
        console.log(`✅ Staking 운영자 설정: ${serverMinter}`);
    }

    console.log("\n========================================");
    console.log("🎉 배포 완료!");
    console.log(`HaBit (HBT):     ${habitAddress}`);
    console.log(`HaBitStaking:    ${stakingAddress}`);
    console.log(`🔍 https://sepolia.basescan.org/address/${stakingAddress}`);
    console.log("========================================");

    const fs = require("fs");
    const deployInfo = {
        network: hre.network.name,
        chainId: hre.network.config.chainId,
        deployer: deployer.address,
        contracts: { HaBit: habitAddress, HaBitStaking: stakingAddress },
        timestamp: new Date().toISOString()
    };
    fs.writeFileSync(`deployments-${hre.network.name}.json`, JSON.stringify(deployInfo, null, 2));
    console.log(`💾 배포 정보 저장: deployments-${hre.network.name}.json`);
}

main().then(() => process.exit(0)).catch(e => { console.error("❌ 실패:", e); process.exit(1); });
