/**
 * setMinter 스크립트 — Server Minter에 채굴 권한 부여
 * 
 * Deployer(owner)가 호출:
 *   1. HaBit.setMinter(serverMinter, true) — 채굴 권한
 *   2. HaBitStaking.setOperator(serverMinter, true) — 챌린지 정산 권한
 * 
 * 사전 조건:
 *   - contracts/.env 에 DEPLOYER_PRIVATE_KEY, SERVER_MINTER_ADDRESS 설정
 *   - Deployer에 SepoliaETH 잔액 필요 (가스비)
 * 
 * 사용법:
 *   npx hardhat run scripts/setup-minter.js --network baseSepolia
 */

const hre = require("hardhat");
const deployments = require("../deployments-baseSepolia.json");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const serverMinter = process.env.SERVER_MINTER_ADDRESS;

    if (!serverMinter) {
        console.error("❌ SERVER_MINTER_ADDRESS가 .env에 설정되지 않았습니다.");
        process.exit(1);
    }

    console.log("========================================");
    console.log("🔑 Server Minter 권한 설정");
    console.log("========================================");
    console.log(`Deployer (owner): ${deployer.address}`);
    console.log(`Server Minter:    ${serverMinter}`);
    console.log(`네트워크:          ${hre.network.name}`);
    console.log(`HaBit:            ${deployments.contracts.HaBit}`);
    console.log(`HaBitStaking:     ${deployments.contracts.HaBitStaking}`);
    console.log("----------------------------------------");

    // 잔액 확인
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log(`Deployer 잔액: ${hre.ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        console.error("❌ Deployer에 ETH 잔액이 없습니다. 가스비가 필요합니다.");
        console.log(`Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet`);
        process.exit(1);
    }

    // 1. HaBit 컨트랙트에 민터 권한 부여
    console.log("\n📝 1/2: HaBit.setMinter() 호출 중...");
    const HaBit = await hre.ethers.getContractFactory("HaBit");
    const habit = HaBit.attach(deployments.contracts.HaBit);

    // 이미 설정되었는지 확인
    const alreadyMinter = await habit.authorizedMinters(serverMinter);
    if (alreadyMinter) {
        console.log("ℹ️  이미 민터로 설정되어 있습니다. 스킵.");
    } else {
        const tx1 = await habit.setMinter(serverMinter, true);
        const receipt1 = await tx1.wait();
        console.log(`✅ HaBit 민터 설정 완료! TX: ${receipt1.hash}`);
    }

    // 2. HaBitStaking 컨트랙트에 운영자 권한 부여
    console.log("\n📝 2/2: HaBitStaking.setOperator() 호출 중...");
    const HaBitStaking = await hre.ethers.getContractFactory("HaBitStaking");
    const staking = HaBitStaking.attach(deployments.contracts.HaBitStaking);

    const alreadyOperator = await staking.operators(serverMinter);
    if (alreadyOperator) {
        console.log("ℹ️  이미 운영자로 설정되어 있습니다. 스킵.");
    } else {
        const tx2 = await staking.setOperator(serverMinter, true);
        const receipt2 = await tx2.wait();
        console.log(`✅ Staking 운영자 설정 완료! TX: ${receipt2.hash}`);
    }

    // 검증
    console.log("\n========================================");
    console.log("✅ 권한 설정 완료!");
    console.log("========================================");
    console.log(`HaBit 민터:    ${await habit.authorizedMinters(serverMinter)}`);
    console.log(`Staking 운영자: ${await staking.operators(serverMinter)}`);
    
    const explorerBase = hre.network.name === "base" 
        ? "https://basescan.org" 
        : "https://sepolia.basescan.org";
    console.log(`\n🔍 Server Minter: ${explorerBase}/address/${serverMinter}`);
    console.log("========================================");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 오류:", error);
        process.exit(1);
    });
