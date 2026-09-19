import { MarketRecordBase } from './marketRecordBase';

export interface KalshiDataRecord extends MarketRecordBase {
    /** What YES means within a multi-market event (Kalshi's yes_sub_title). */
    subtitle?: string;
}
