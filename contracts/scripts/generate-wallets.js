/**
 * 공공재 지갑 생성 스크립트
 * 
 * 생성되는 지갑:
 *   1. Server Minter — Cloud Function에서 habitMine() 호출용
 *   2. Reserve — 운영/시즌 보상/초기 보너스 보관용
 * 
 * ⚠️ 개인키는 화면에 한 번만 표시됩니다. 반드시 안전하게 백업하세요!
 * 
 * 사용법:
 *   node scripts/generate-wallets.js
 */

const { ethers } = require("ethers");

function main() {
    console.log("========================================");
    console.log("🔑 HaBit 공공재 지갑 생성");
    console.log("========================================\n");

    // 1. Server Minter 지갑
    const serverWallet = ethers.Wallet.createRandom();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🖥️  Server Minter (Cloud Function용)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  용도: habitMine() 호출, 사용자 HBT 채굴 처리`);
    console.log(`  주소: ${serverWallet.address}`);
    console.log(`  개인키: ${serverWallet.privateKey}`);
    console.log("");

    // 2. Reserve 지갑
    const reserveWallet = ethers.Wallet.createRandom();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🏦 Reserve (운영/시즌/보너스 보관)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  용도: operationalMint() 수령, 시즌 보상 배분, 유동성 풀`);
    console.log(`  주소: ${reserveWallet.address}`);
    console.log(`  개인키: ${reserveWallet.privateKey}`);
    console.log("");

    // .env 설정 안내
    console.log("========================================");
    console.log("📝 다음 단계");
    console.log("========================================");
    console.log("");
    console.log("1. contracts/.env 에 추가:");
    console.log("─────────────────────────────────────────");
    console.log(`SERVER_MINTER_ADDRESS=${serverWallet.address}`);
    console.log(`SERVER_MINTER_PRIVATE_KEY=${serverWallet.privateKey}`);
    console.log(`RESERVE_WALLET_ADDRESS=${reserveWallet.address}`);
    console.log(`RESERVE_WALLET_PRIVATE_KEY=${reserveWallet.privateKey}`);
    console.log("─────────────────────────────────────────");
    console.log("");
    console.log("2. Deployer가 setMinter() 호출:");
    console.log(`   npx hardhat run scripts/setup-minter.js --network baseSepolia`);
    console.log("");
    console.log("3. Firebase Cloud Function에 SERVER_MINTER_PRIVATE_KEY 설정:");
    console.log(`   firebase functions:secrets:set SERVER_MINTER_KEY`);
    console.log("");
    console.log("⚠️  개인키를 안전하게 백업하세요! 이 화면을 닫으면 복구 불가!");
    console.log("========================================");
}

main();
