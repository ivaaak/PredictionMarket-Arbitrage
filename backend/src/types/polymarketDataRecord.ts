import { MarketRecordBase } from './marketRecordBase';

export interface PolymarketDataRecord extends MarketRecordBase {
    /** Label of the outcome treated as YES (usually "Yes", or a team/candidate name). */
    outcome?: string;
}
