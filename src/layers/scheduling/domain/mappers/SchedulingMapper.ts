/**
 * SchedulingMapper
 */

export interface SchedulingDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface SchedulingEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SchedulingMapper {
  toDto(entity: SchedulingEntityData): SchedulingDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: SchedulingDto): SchedulingEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: SchedulingEntityData[]): SchedulingDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: SchedulingDto[]): SchedulingEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: SchedulingEntityData, patch: Partial<SchedulingEntityData>): SchedulingEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
