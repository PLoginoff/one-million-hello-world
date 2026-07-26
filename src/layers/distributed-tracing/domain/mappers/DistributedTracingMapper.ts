/**
 * DistributedTracingMapper
 */

export interface DistributedTracingDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface DistributedTracingEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DistributedTracingMapper {
  toDto(entity: DistributedTracingEntityData): DistributedTracingDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: DistributedTracingDto): DistributedTracingEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: DistributedTracingEntityData[]): DistributedTracingDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: DistributedTracingDto[]): DistributedTracingEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(
    base: DistributedTracingEntityData,
    patch: Partial<DistributedTracingEntityData>
  ): DistributedTracingEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
