import type { TicketType } from '@/models';
import type { IProductStrategy } from './types';
import { SightStrategy } from './sight';
import { ShowStrategy } from './show';
import { DiningStrategy } from './dining';
import { ExperienceStrategy } from './experience';
import { OtherStrategy } from './other';

/**
 * 策略注册表。新增票种时只需在此追加一行。
 */
const strategies: Record<TicketType, IProductStrategy> = {
  sight: SightStrategy,
  show: ShowStrategy,
  dining: DiningStrategy,
  experience: ExperienceStrategy,
  other: OtherStrategy,
};

export function getStrategy(ticketType: TicketType): IProductStrategy {
  const s = strategies[ticketType];
  if (!s) throw new Error(`No strategy for ticketType=${ticketType}`);
  return s;
}

export function registerStrategy(ticketType: TicketType, strategy: IProductStrategy) {
  strategies[ticketType] = strategy;
}
