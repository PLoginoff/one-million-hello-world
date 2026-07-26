/**
 * DeadLetterMapper
 */

export interface DeadLetterDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface DeadLetterEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DeadLetterMapper {
  toDto(entity: DeadLetterEntityData): DeadLetterDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: DeadLetterDto): DeadLetterEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: DeadLetterEntityData[]): DeadLetterDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: DeadLetterDto[]): DeadLetterEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: DeadLetterEntityData, patch: Partial<DeadLetterEntityData>): DeadLetterEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
