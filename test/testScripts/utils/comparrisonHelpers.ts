import { BigNumber } from "../../../src/utils/bignumber";
import { ethers } from "ethers";
import { PoolPairData, Path } from "../../../src/types";
import { getPoolsWithSingleToken } from "./subgraph";
import {
  BONE,
  TWOBONE,
  MAX_IN_RATIO,
  MAX_OUT_RATIO,
  bmul,
  bdiv,
  bnum,
  calcOutGivenIn,
  calcInGivenOut,
  scale
} from "../../../src/bmath";

export function toChecksum(address) {
  return ethers.utils.getAddress(address);
}

export function getLimitAmountSwap(
  poolPairData: PoolPairData,
  swapType: string
): BigNumber {
  if (swapType === "swapExactIn") {
    return bmul(poolPairData.balanceIn, MAX_IN_RATIO);
  } else {
    return bmul(poolPairData.balanceOut, MAX_OUT_RATIO);
  }
}

export function getLimitAmountSwapPath(
  pools: any[],
  path: Path,
  swapType: string
): BigNumber {
  let swaps = path.swaps;
  if (swaps.length == 1) {
    let swap1 = swaps[0];
    let poolSwap1 = pools[swap1.pool];
    let poolPairDataSwap1 = parsePoolPairData(
      poolSwap1,
      swap1.tokenIn,
      swap1.tokenOut
    );
    return getLimitAmountSwap(poolPairDataSwap1, swapType);
  } else if (swaps.length == 2) {
    let swap1 = swaps[0];
    let poolSwap1 = pools[swap1.pool];
    let poolPairDataSwap1 = parsePoolPairData(
      poolSwap1,
      swap1.tokenIn,
      swap1.tokenOut
    );

    let swap2 = swaps[1];
    let poolSwap2 = pools[swap2.pool];
    let poolPairDataSwap2 = parsePoolPairData(
      poolSwap2,
      swap2.tokenIn,
      swap2.tokenOut
    );

    if (swapType === "swapExactIn") {
      return BigNumber.min(
        // The limit is either set by limit_IN of poolPairData 1 or indirectly by limit_IN of poolPairData 2
        getLimitAmountSwap(poolPairDataSwap1, swapType),
        bmul(
          getLimitAmountSwap(poolPairDataSwap2, swapType),
          getSpotPrice(poolPairDataSwap1)
        ) // we need to multiply the limit_IN of
        // poolPairData 2 by the spotPrice of poolPairData 1 to get the equivalent in token IN
      );
    } else {
      return BigNumber.min(
        // The limit is either set by limit_OUT of poolPairData 2 or indirectly by limit_OUT of poolPairData 1
        getLimitAmountSwap(poolPairDataSwap2, swapType),
        bdiv(
          getLimitAmountSwap(poolPairDataSwap1, swapType),
          getSpotPrice(poolPairDataSwap2)
        ) // we need to divide the limit_OUT of
        // poolPairData 1 by the spotPrice of poolPairData 2 to get the equivalent in token OUT
      );
    }
  } else {
    throw new Error("Path with more than 2 swaps not supported");
  }
}

export function getSpotPricePath(pools: any[], path: Path): BigNumber {
  let swaps = path.swaps;
  if (swaps.length == 1) {
    let swap1 = swaps[0];
    let poolSwap1 = pools[swap1.pool];
    let poolPairDataSwap1 = parsePoolPairData(
      poolSwap1,
      swap1.tokenIn,
      swap1.tokenOut
    );
    return getSpotPrice(poolPairDataSwap1);
  } else if (swaps.length == 2) {
    let swap1 = swaps[0];
    let poolSwap1 = pools[swap1.pool];
    let poolPairDataSwap1 = parsePoolPairData(
      poolSwap1,
      swap1.tokenIn,
      swap1.tokenOut
    );

    let swap2 = swaps[1];
    let poolSwap2 = pools[swap2.pool];
    let poolPairDataSwap2 = parsePoolPairData(
      poolSwap2,
      swap2.tokenIn,
      swap2.tokenOut
    );

    return bmul(
      getSpotPrice(poolPairDataSwap1),
      getSpotPrice(poolPairDataSwap2)
    );
  } else {
    throw new Error("Path with more than 2 swaps not supported");
  }
}

export function getSpotPrice(poolPairData: PoolPairData): BigNumber {
  let inRatio = bdiv(poolPairData.balanceIn, poolPairData.weightIn);
  let outRatio = bdiv(poolPairData.balanceOut, poolPairData.weightOut);
  if (outRatio.isEqualTo(bnum(0))) {
    return bnum(0);
  } else {
    return bdiv(bdiv(inRatio, outRatio), BONE.minus(poolPairData.swapFee));
  }
}

export function getSlippageLinearizedSpotPriceAfterSwapPath(
  pools: any[],
  path: Path,
  swapType: string
): BigNumber {
  let swaps = path.swaps;
  if (swaps.length == 1) {
    let swap1 = swaps[0];
    let poolSwap1 = pools[swap1.pool];
    let poolPairDataSwap1 = parsePoolPairData(
      poolSwap1,
      swap1.tokenIn,
      swap1.tokenOut
    );

    return getSlippageLinearizedSpotPriceAfterSwap(poolPairDataSwap1, swapType);
  } else if (swaps.length == 2) {
    let swap1 = swaps[0];
    let poolSwap1 = pools[swap1.pool];
    let p1 = parsePoolPairData(poolSwap1, swap1.tokenIn, swap1.tokenOut);

    let swap2 = swaps[1];
    let poolSwap2 = pools[swap2.pool];
    let p2 = parsePoolPairData(poolSwap2, swap2.tokenIn, swap2.tokenOut);
    if (p1.balanceIn.isEqualTo(bnum(0)) || p2.balanceIn.isEqualTo(bnum(0))) {
      return bnum(0);
    } else {
      // Since the numerator is the same for both 'swapExactIn' and 'swapExactOut' we do this first
      // See formulas on https://one.wolframcloud.com/env/fernando.martinel/SOR_multihop_analysis.nb
      let numerator1 = bmul(
        bmul(
          bmul(BONE.minus(p1.swapFee), BONE.minus(p2.swapFee)), // In mathematica both terms are the negative (which compensates)
          p1.balanceOut
        ),
        bmul(p1.weightIn, p2.weightIn)
      );

      let numerator2 = bmul(
        bmul(
          p1.balanceOut.plus(p2.balanceIn),
          BONE.minus(p1.swapFee) // In mathematica this is the negative but we add (instead of subtracting) numerator2 to compensate
        ),
        bmul(p1.weightIn, p2.weightOut)
      );

      let numerator3 = bmul(p2.balanceIn, bmul(p1.weightOut, p2.weightOut));

      let numerator = numerator1.plus(numerator2).plus(numerator3);

      // The denominator is different for 'swapExactIn' and 'swapExactOut'
      if (swapType === "swapExactIn") {
        let denominator = bmul(
          bmul(p1.balanceIn, p2.balanceIn),
          bmul(p1.weightOut, p2.weightOut)
        );
        return bdiv(numerator, denominator);
      } else {
        let denominator = bmul(
          bmul(BONE.minus(p1.swapFee), BONE.minus(p2.swapFee)),
          bmul(
            bmul(p1.balanceOut, p2.balanceOut),
            bmul(p1.weightIn, p2.weightIn)
          )
        );
        return bdiv(numerator, denominator);
      }
    }
  } else {
    throw new Error("Path with more than 2 swaps not supported");
  }
}

export function getSlippageLinearizedSpotPriceAfterSwap(
  poolPairData: PoolPairData,
  swapType: string
): BigNumber {
  let { weightIn, weightOut, balanceIn, balanceOut, swapFee } = poolPairData;
  if (swapType === "swapExactIn") {
    if (balanceIn.isEqualTo(bnum(0))) {
      return bnum(0);
    } else {
      return bdiv(
        bmul(BONE.minus(swapFee), bdiv(weightIn, weightOut)).plus(BONE),
        balanceIn
      );
    }
  } else {
    if (balanceOut.isEqualTo(bnum(0))) {
      return bnum(0);
    } else {
      return bdiv(
        bdiv(weightOut, bmul(BONE.minus(swapFee), weightIn)).plus(BONE),
        balanceOut
      );
    }
  }
}

export function getReturnAmountSwapPath(
  pools: any[],
  path: Path,
  swapType: string,
  amount: BigNumber
): BigNumber {
  let swaps = path.swaps;
  if (swaps.length == 1) {
    let swap1 = swaps[0];
    let poolSwap1 = pools[swap1.pool];
    let poolPairDataSwap1 = parsePoolPairData(
      poolSwap1,
      swap1.tokenIn,
      swap1.tokenOut
    );
    return getReturnAmountSwap(pools, poolPairDataSwap1, swapType, amount);
  } else if (swaps.length == 2) {
    let swap1 = swaps[0];
    let poolSwap1 = pools[swap1.pool];
    let poolPairDataSwap1 = parsePoolPairData(
      poolSwap1,
      swap1.tokenIn,
      swap1.tokenOut
    );

    let swap2 = swaps[1];
    let poolSwap2 = pools[swap2.pool];
    let poolPairDataSwap2 = parsePoolPairData(
      poolSwap2,
      swap2.tokenIn,
      swap2.tokenOut
    );

    if (swapType === "swapExactIn") {
      // The outputAmount is number of tokenOut we receive from the second poolPairData
      let returnAmountSwap1 = getReturnAmountSwap(
        pools,
        poolPairDataSwap1,
        swapType,
        amount
      );

      return getReturnAmountSwap(
        pools,
        poolPairDataSwap2,
        swapType,
        returnAmountSwap1
      );
    } else {
      // The outputAmount is number of tokenIn we send to the first poolPairData
      let returnAmountSwap2 = getReturnAmountSwap(
        pools,
        poolPairDataSwap2,
        swapType,
        amount
      );
      return getReturnAmountSwap(
        pools,
        poolPairDataSwap1,
        swapType,
        returnAmountSwap2
      );
    }
  } else {
    throw new Error("Path with more than 2 swaps not supported");
  }
}

export function getReturnAmountSwap(
  pools: any[],
  poolPairData: PoolPairData,
  swapType: string,
  amount: BigNumber
): BigNumber {
  let {
    weightIn,
    weightOut,
    balanceIn,
    balanceOut,
    swapFee,
    tokenIn,
    tokenOut
  } = poolPairData;
  let returnAmount;
  if (swapType === "swapExactIn") {
    if (balanceIn.isEqualTo(bnum(0))) {
      return bnum(0);
    } else {
      returnAmount = calcOutGivenIn(
        balanceIn,
        weightIn,
        balanceOut,
        weightOut,
        amount,
        swapFee
      );
      // Update balances of tokenIn and tokenOut
      pools[poolPairData.id] = updateTokenBalanceForPool(
        pools[poolPairData.id],
        tokenIn,
        balanceIn.plus(amount)
      );
      pools[poolPairData.id] = updateTokenBalanceForPool(
        pools[poolPairData.id],
        tokenOut,
        balanceOut.minus(returnAmount)
      );
      return returnAmount;
    }
  } else {
    if (balanceOut.isEqualTo(bnum(0))) {
      return bnum(0);
    } else {
      returnAmount = calcInGivenOut(
        balanceIn,
        weightIn,
        balanceOut,
        weightOut,
        amount,
        swapFee
      );
      // Update balances of tokenIn and tokenOut
      pools[poolPairData.id] = updateTokenBalanceForPool(
        pools[poolPairData.id],
        tokenIn,
        balanceIn.plus(returnAmount)
      );
      pools[poolPairData.id] = updateTokenBalanceForPool(
        pools[poolPairData.id],
        tokenOut,
        balanceOut.minus(amount)
      );
      return returnAmount;
    }
  }
}

// Updates the balance of a given token for a given pool passed as parameter
export function updateTokenBalanceForPool(
  pool: any,
  token: string,
  balance: BigNumber
): any {
  // console.log("pool")
  // console.log(pool)
  // console.log("token")
  // console.log(token)
  // console.log("balance")
  // console.log(balance)

  // Scale down back as balances are stored scaled down by the decimals
  let T = pool.tokens.find(t => t.address === token);
  T.balance = scale(balance, -T.decimals).toString(); // scale down, hence negative sign
  return pool;
}

// Based on the function of same name of file onchain-sor in file: BRegistry.sol
// Normalized liquidity is not used in any calculationf, but instead for comparison between poolPairDataList only
// so we can find the most liquid poolPairData considering the effect of uneven weigths
export function getNormalizedLiquidity(poolPairData: PoolPairData): BigNumber {
  let { weightIn, weightOut, balanceIn, balanceOut, swapFee } = poolPairData;
  return bdiv(bmul(balanceOut, weightIn), weightIn.plus(weightOut));
}

export async function getMultihopPoolsWithTokens(tokenIn, tokenOut) {
  //// Multi-hop trades: we find the best pools that connect tokenIn and tokenOut through a multi-hop (intermediate) token
  // First: we get all tokens that can be used to be traded with tokenIn excluding
  // tokens that are in pools that already contain tokenOut (in which case multi-hop is not necessary)
  const poolsTokenIn = await getPoolsWithSingleToken(tokenIn);
  const poolsTokenInNoTokenOut = filterPoolsWithoutToken(
    poolsTokenIn,
    tokenOut
  );
  // console.log("poolsTokenInNoTokenOut");
  // console.log(poolsTokenInNoTokenOut);

  const tokenInHopTokens = getTokensPairedToTokenWithinPools(
    poolsTokenInNoTokenOut,
    tokenIn
  );

  // Second: we get all tokens that can be used to be traded with tokenOut excluding
  // tokens that are in pools that already contain tokenIn (in which case multi-hop is not necessary)
  const poolsTokenOut = await getPoolsWithSingleToken(tokenOut);
  const poolsTokenOutNoTokenIn = filterPoolsWithoutToken(
    poolsTokenOut,
    tokenIn
  );
  // console.log(poolsTokenOutNoTokenIn);
  // console.log("poolsTokenOutNoTokenIn");

  // console.log(poolsTokenOutNoTokenIn[poolsTokenOutNoTokenIn.length-1].tokens);

  const tokenOutHopTokens = getTokensPairedToTokenWithinPools(
    poolsTokenOutNoTokenIn,
    tokenOut
  );

  // Third: we find the intersection of the two previous sets so we can trade tokenIn for tokenOut with 1 multi-hop
  // code from https://stackoverflow.com/a/31931146
  const hopTokensSet = new Set(
    [...Array.from(tokenInHopTokens)].filter(i => tokenOutHopTokens.has(i))
  );
  // Transform set into Array
  const hopTokens = Array.from(hopTokensSet);
  // console.log(hopTokens);

  // Find the most liquid pool for each pair (tokenIn -> hopToken). We store an object in the form:
  // mostLiquidPoolsFirstHop = {hopToken1: mostLiquidPool, hopToken2: mostLiquidPool, ... , hopTokenN: mostLiquidPool}
  // Here we could query subgraph for all pools with pair (tokenIn -> hopToken), but to
  // minimize subgraph calls we loop through poolsTokenInNoTokenOut, and check the liquidity
  // only for those that have hopToken
  let mostLiquidPoolsFirstHop = [];
  for (let i = 0; i < hopTokens.length; i++) {
    let highestNormalizedLiquidity = bnum(0); // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
    let highestNormalizedLiquidityPoolId; // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
    for (let k in poolsTokenInNoTokenOut) {
      // We now loop to check if this pool has hopToken
      let found = false;
      for (let j = 0; j < poolsTokenInNoTokenOut[k].tokensList.length; j++) {
        if (
          poolsTokenInNoTokenOut[k].tokensList[j].toLowerCase() == hopTokens[i]
        ) {
          // console.log("poolsTokenInNoTokenOut[k].tokensList[j].toLowerCase()");
          // console.log(poolsTokenInNoTokenOut[k].tokensList[j].toLowerCase());
          // console.log("hopTokens[i]")
          // console.log(hopTokens[i])
          found = true;
          break;
        }
      }
      // If this pool has hopTokens[i] calculate its normalized liquidity
      if (found) {
        let normalizedLiquidity = getNormalizedLiquidity(
          parsePoolPairData(
            poolsTokenInNoTokenOut[k],
            tokenIn,
            hopTokens[i].toString()
          )
        );

        if (
          normalizedLiquidity.isGreaterThanOrEqualTo(
            // Cannot be strictly greater otherwise
            // highestNormalizedLiquidityPoolId = 0 if hopTokens[i] balance is 0 in this pool.
            highestNormalizedLiquidity
          )
        ) {
          highestNormalizedLiquidity = normalizedLiquidity;
          highestNormalizedLiquidityPoolId = k;
        }
      }
    }
    mostLiquidPoolsFirstHop[i] =
      poolsTokenInNoTokenOut[highestNormalizedLiquidityPoolId];
    // console.log(highestNormalizedLiquidity)
    // console.log(mostLiquidPoolsFirstHop)
  }

  // console.log('mostLiquidPoolsFirstHop');
  // console.log(mostLiquidPoolsFirstHop);

  // Now similarly find the most liquid pool for each pair (hopToken -> tokenOut)
  let mostLiquidPoolsSecondHop = [];
  for (let i = 0; i < hopTokens.length; i++) {
    let highestNormalizedLiquidity = bnum(0); // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
    let highestNormalizedLiquidityPoolId; // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
    for (let k in poolsTokenOutNoTokenIn) {
      // We now loop to check if this pool has hopToken
      let found = false;
      for (let j = 0; j < poolsTokenOutNoTokenIn[k].tokensList.length; j++) {
        if (
          poolsTokenOutNoTokenIn[k].tokensList[j].toLowerCase() == hopTokens[i]
        ) {
          found = true;
          break;
        }
      }
      // If this pool has hopTokens[i] calculate its normalized liquidity
      if (found) {
        let normalizedLiquidity = getNormalizedLiquidity(
          parsePoolPairData(
            poolsTokenOutNoTokenIn[k],
            hopTokens[i].toString(),
            tokenOut
          )
        );

        if (
          normalizedLiquidity.isGreaterThanOrEqualTo(
            // Cannot be strictly greater otherwise
            // highestNormalizedLiquidityPoolId = 0 if hopTokens[i] balance is 0 in this pool.
            highestNormalizedLiquidity
          )
        ) {
          highestNormalizedLiquidity = normalizedLiquidity;
          highestNormalizedLiquidityPoolId = k;
        }
      }
    }
    mostLiquidPoolsSecondHop[i] =
      poolsTokenOutNoTokenIn[highestNormalizedLiquidityPoolId];
    // console.log(highestNormalizedLiquidity)
    // console.log(mostLiquidPoolsSecondHop)
  }
  return [mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop, hopTokens];
}

export const parsePoolPairData = (
  p,
  tokenIn: string,
  tokenOut: string
): PoolPairData => {
  // console.log("Pool")
  // console.log(p)
  // console.log("tokenIn")
  // console.log(tokenIn)
  // console.log("tokenOut")
  // console.log(tokenOut)

  let tI = p.tokens.find(
    t => ethers.utils.getAddress(t.address) === ethers.utils.getAddress(tokenIn)
  );
  // console.log("tI")
  // console.log(tI)
  let tO = p.tokens.find(
    t =>
      ethers.utils.getAddress(t.address) === ethers.utils.getAddress(tokenOut)
  );

  // console.log("tO")
  // console.log(tO)

  let poolPairData = {
    id: p.id,
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    decimalsIn: tI.decimals,
    decimalsOut: tO.decimals,
    balanceIn: scale(bnum(tI.balance), tI.decimals),
    balanceOut: scale(bnum(tO.balance), tO.decimals),
    weightIn: scale(bnum(tI.denormWeight).div(bnum(p.totalWeight)), 18),
    weightOut: scale(bnum(tO.denormWeight).div(bnum(p.totalWeight)), 18),
    swapFee: scale(bnum(p.swapFee), 18)
  };

  return poolPairData;
};

function filterPoolsWithoutToken(pools, token) {
  let found;
  let OutputPools = {};
  for (let i in pools) {
    found = false;
    for (let k = 0; k < pools[i].tokensList.length; k++) {
      if (pools[i].tokensList[k].toLowerCase() == token.toLowerCase()) {
        found = true;
        break;
      }
    }
    //Add pool if token not found
    if (!found) OutputPools[i] = pools[i];
  }
  return OutputPools;
}

// Inputs:
// - pools: All pools that contain a token
// - token: Token for which we are looking for pairs
// Outputs:
// - tokens: Set (without duplicate elements) of all tokens that pair with token
function getTokensPairedToTokenWithinPools(pools, token) {
  let found;
  let tokens = new Set();
  for (let i in pools) {
    found = false;
    for (let k = 0; k < pools[i].tokensList.length; k++) {
      if (
        ethers.utils.getAddress(pools[i].tokensList[k]) !=
          ethers.utils.getAddress(token) &&
        pools[i].tokens.find(
          t =>
            ethers.utils.getAddress(t.address) ===
            ethers.utils.getAddress(pools[i].tokensList[k])
        ).balance != 0
      ) {
        tokens.add(pools[i].tokensList[k]);
      }
    }
  }
  return tokens;
}
