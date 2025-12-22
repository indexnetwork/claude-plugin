import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { intentQueue } from './intent.queue';
import { newsletterQueue } from './newsletter.queue';
import { opportunityQueue } from './opportunity.queue';
import { emailQueue } from '../lib/email/queue/email.queue';

export const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/');

createBullBoard({
  queues: [
    new BullMQAdapter(intentQueue),
    new BullMQAdapter(newsletterQueue),
    new BullMQAdapter(opportunityQueue),
    new BullMQAdapter(emailQueue),
  ],
  serverAdapter: serverAdapter,
});

export const router = serverAdapter.getRouter();
