import type { AiEntityType, InterviewerEntityConfig } from '../entity-config';
import { productConfig } from './product';
import { serviceConfig } from './service';
import { systemConfig } from './system';

export { productConfig } from './product';
export { serviceConfig } from './service';
export { systemConfig } from './system';

export const ENTITY_CONFIGS: Record<AiEntityType, InterviewerEntityConfig> = {
  product: productConfig,
  service: serviceConfig,
  system: systemConfig,
};
