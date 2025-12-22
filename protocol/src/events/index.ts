import { IntentEvents } from "./intent.event";
import { IndexEvents } from "./index.event";
import { MemberEvents } from "./user.event";

/**
 * Centralized event dispatcher
 */
export const Events = {
  Intent: IntentEvents,
  Index: IndexEvents,
  Member: MemberEvents
};

export * from './intent.event';
export * from './index.event';
export * from './user.event';
