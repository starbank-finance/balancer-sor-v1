import { BaseProvider } from "@ethersproject/providers";
import { BigNumber } from "./utils/bignumber";
export declare function getAddress(tokenA: string, tokenB: string): string;
export declare function getOnChainReserves(
  PairAddr: string,
  provider: BaseProvider
): Promise<any[]>;
export declare function getTokenWeiPrice(
  TokenAddr: string,
  provider: BaseProvider
): Promise<BigNumber>;
export declare function calculateTotalSwapCost(
  TokenPrice: BigNumber,
  SwapCost: BigNumber,
  GasPriceWei: BigNumber
): BigNumber;
export declare function getCostOutputToken(
  TokenAddr: string,
  GasPriceWei: BigNumber,
  SwapGasCost: BigNumber,
  Provider: BaseProvider,
  ChainId?: number
): Promise<BigNumber>;
