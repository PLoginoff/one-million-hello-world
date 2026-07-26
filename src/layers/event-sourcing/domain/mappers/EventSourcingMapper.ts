/**
 * EventSourcingMapper
 */

export interface EventSourcingDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface EventSourcingEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class EventSourcingMapper {
  toDto(entity: EventSourcingEntityData): EventSourcingDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: EventSourcingDto): EventSourcingEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: EventSourcingEntityData[]): EventSourcingDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: EventSourcingDto[]): EventSourcingEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: EventSourcingEntityData, patch: Partial<EventSourcingEntityData>): EventSourcingEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
