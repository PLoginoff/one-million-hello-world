/**
 * MessageBusMapper
 */

export interface MessageBusDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface MessageBusEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MessageBusMapper {
  toDto(entity: MessageBusEntityData): MessageBusDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: MessageBusDto): MessageBusEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: MessageBusEntityData[]): MessageBusDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: MessageBusDto[]): MessageBusEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: MessageBusEntityData, patch: Partial<MessageBusEntityData>): MessageBusEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
