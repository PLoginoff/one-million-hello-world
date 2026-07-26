/**
 * BatchProcessingMapper
 */

export interface BatchProcessingDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface BatchProcessingEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BatchProcessingMapper {
  toDto(entity: BatchProcessingEntityData): BatchProcessingDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: BatchProcessingDto): BatchProcessingEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: BatchProcessingEntityData[]): BatchProcessingDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: BatchProcessingDto[]): BatchProcessingEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: BatchProcessingEntityData, patch: Partial<BatchProcessingEntityData>): BatchProcessingEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
