/**
 * Deployer → Server Minter로 ETH 가스비 전송
 */
require("dotenv").config();
const { ethers } = require("ethers");

const RPC_URL = "https://sepolia.base.org";
const CHAIN_ID = 84532;
const SERVER_MINTER = "0xDc84e09C6F62591e788B84Ff1051d51EbEDA8230";

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

    const balance = await provider.getBalance(deployer.address);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Deployer 잔액: ${ethers.formatEther(balance)} ETH`);

    // 가스비 계산
    const gasPrice = (await provider.getFeeData()).gasPrice;
    const gasCost = gasPrice * 21000n;
    
    // 잔액에서 가스비의 2배를 빼고 나머지 전송 (안전 마진)
    const sendAmount = balance - (gasCost * 3n);
    
    if (sendAmount <= 0n) {
        console.log("❌ 잔액 부족");
        return;
    }

    console.log(`가스비 예상: ${ethers.formatEther(gasCost)} ETH`);
    console.log(`전송 금액: ${ethers.formatEther(sendAmount)} ETH`);
    console.log(`보낼 주소: ${SERVER_MINTER}`);
    console.log("");

    const tx = await deployer.sendTransaction({
        to: SERVER_MINTER,
        value: sendAmount,
    });
    console.log(`TX 전송됨: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`✅ 확인됨! 블록: ${receipt.blockNumber}`);
    
    const newBalance = await provider.getBalance(SERVER_MINTER);
    console.log(`Server Minter 잔액: ${ethers.formatEther(newBalance)} ETH`);
}

main().catch(console.error);
