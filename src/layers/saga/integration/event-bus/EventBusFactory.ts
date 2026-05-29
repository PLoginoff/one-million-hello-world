/**
 * Event Bus Factory
 *
 * Factory for creating event bus integrations.
 * Provides convenient methods for creating configured event buses.
 */

import { KafkaEventBus, KafkaConfig } from './KafkaEventBus';
import { RabbitMQEventBus, RabbitMQConfig } from './RabbitMQEventBus';

export type EventBusType = 'kafka' | 'rabbitmq' | 'memory';

export class EventBusFactory {
  /**
   * Create Kafka event bus
   */
  static createKafka(config: KafkaConfig): KafkaEventBus {
    return new KafkaEventBus(config);
  }

  /**
   * Create RabbitMQ event bus
   */
  static createRabbitMQ(config: RabbitMQConfig): RabbitMQEventBus {
    return new RabbitMQEventBus(config);
  }

  /**
   * Create event bus by type
   */
  static createByType(type: EventBusType, config: KafkaConfig | RabbitMQConfig): any {
    switch (type) {
      case 'kafka':
        return this.createKafka(config as KafkaConfig);
      case 'rabbitmq':
        return this.createRabbitMQ(config as RabbitMQConfig);
      default:
        throw new Error(`Unknown event bus type: ${type}`);
    }
  }
}
