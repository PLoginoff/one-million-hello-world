/**
 * CompressionMapper
 */

export interface CompressionDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface CompressionEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CompressionMapper {
  toDto(entity: CompressionEntityData): CompressionDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: CompressionDto): CompressionEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: CompressionEntityData[]): CompressionDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: CompressionDto[]): CompressionEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: CompressionEntityData, patch: Partial<CompressionEntityData>): CompressionEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
