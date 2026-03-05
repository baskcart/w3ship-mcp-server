/**
 * Quick integration test for Uniswap Trading API tools.
 * 
 * Usage:
 *   $env:UNISWAP_API_KEY="your-key"
 *   npx tsx test-uniswap.ts
 */

const UNISWAP_API = 'https://trade-api.gateway.uniswap.org/v1';
const API_KEY = process.env.UNISWAP_API_KEY;

const TOKENS: Record<string, { address: string; decimals: number }> = {
    ETH: { address: '0x0000000000000000000000000000000000000000', decimals: 18 },
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
};

// Use a well-known public address for testing (Vitalik's)
const TEST_WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

async function testQuote() {
    console.log('\n━━━ Test 1: Get Swap Quote (100 USDC → ETH on Base) ━━━');

    const amount = BigInt(100 * 10 ** 6).toString(); // 100 USDC = 100_000_000

    const res = await fetch(`${UNISWAP_API}/quote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY!,
        },
        body: JSON.stringify({
            tokenIn: TOKENS.USDC.address,
            tokenOut: TOKENS.ETH.address,
            amount,
            type: 'EXACT_INPUT',
            swapper: TEST_WALLET,
            tokenInChainId: 8453,
            tokenOutChainId: 8453,
            protocols: ['V2', 'V3', 'V4'],
        }),
    });

    const data = await res.json();

    if (!res.ok) {
        console.log(`   ❌ FAILED (${res.status}):`, JSON.stringify(data, null, 2));
        return false;
    }

    // Parse output
    const amountOut = data.quote?.amountOut || data.amountOut;
    if (amountOut) {
        const ethOut = (Number(BigInt(amountOut)) / 1e18).toFixed(6);
        console.log(`   ✅ Quote: 100 USDC → ${ethOut} ETH`);
        console.log(`   Gas estimate: ${data.quote?.gasEstimate || data.gasEstimate || 'N/A'}`);
        console.log(`   Price impact: ${data.quote?.priceImpact || data.priceImpact || 'N/A'}`);
    } else {
        console.log(`   ⚠️  Got response but no amountOut:`);
        console.log(`   ${JSON.stringify(data, null, 2).substring(0, 500)}`);
    }
    return true;
}

async function testApproval() {
    console.log('\n━━━ Test 2: Check Token Approval (USDC on Base) ━━━');

    const amount = BigInt(100 * 10 ** 6).toString();

    const res = await fetch(`${UNISWAP_API}/check_approval`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY!,
        },
        body: JSON.stringify({
            token: TOKENS.USDC.address,
            amount,
            walletAddress: TEST_WALLET,
            chainId: 8453,
        }),
    });

    const data = await res.json();

    if (!res.ok) {
        console.log(`   ❌ FAILED (${res.status}):`, JSON.stringify(data, null, 2));
        return false;
    }

    console.log(`   ✅ Approved: ${data.approved}`);
    if (data.approvalTransaction) {
        console.log(`   Approval tx needed: to=${data.approvalTransaction.to}`);
    }
    return true;
}

async function testInvalidKey() {
    console.log('\n━━━ Test 3: Invalid API Key Handling ━━━');

    const res = await fetch(`${UNISWAP_API}/quote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'invalid-key-12345',
        },
        body: JSON.stringify({
            tokenIn: TOKENS.USDC.address,
            tokenOut: TOKENS.ETH.address,
            amount: '100000000',
            type: 'EXACT_INPUT',
            swapper: TEST_WALLET,
            tokenInChainId: 8453,
            tokenOutChainId: 8453,
        }),
    });

    if (res.status === 403 || res.status === 401) {
        console.log(`   ✅ Correctly rejected invalid key (${res.status})`);
        return true;
    }

    console.log(`   ⚠️  Unexpected status: ${res.status}`);
    return false;
}

async function main() {
    console.log('🔄 W3Ship MCP — Uniswap Integration Tests');
    console.log(`   API Key: ${API_KEY ? API_KEY.substring(0, 8) + '...' : '❌ NOT SET'}`);
    console.log(`   Base URL: ${UNISWAP_API}`);

    if (!API_KEY) {
        console.log('\n❌ Set UNISWAP_API_KEY env var first:');
        console.log('   $env:UNISWAP_API_KEY="your-key"');
        process.exit(1);
    }

    let passed = 0;
    let failed = 0;

    (await testQuote()) ? passed++ : failed++;
    (await testApproval()) ? passed++ : failed++;
    (await testInvalidKey()) ? passed++ : failed++;

    console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);
    process.exit(failed > 0 ? 1 : 0);
}

main();
