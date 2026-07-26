/**
 * StreamProcessingMapper
 */

export interface StreamProcessingDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface StreamProcessingEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class StreamProcessingMapper {
  toDto(entity: StreamProcessingEntityData): StreamProcessingDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: StreamProcessingDto): StreamProcessingEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: StreamProcessingEntityData[]): StreamProcessingDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: StreamProcessingDto[]): StreamProcessingEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: StreamProcessingEntityData, patch: Partial<StreamProcessingEntityData>): StreamProcessingEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
