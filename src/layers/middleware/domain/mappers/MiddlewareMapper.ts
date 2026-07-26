/**
 * MiddlewareMapper
 */

export interface MiddlewareDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface MiddlewareEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MiddlewareMapper {
  toDto(entity: MiddlewareEntityData): MiddlewareDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: MiddlewareDto): MiddlewareEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: MiddlewareEntityData[]): MiddlewareDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: MiddlewareDto[]): MiddlewareEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: MiddlewareEntityData, patch: Partial<MiddlewareEntityData>): MiddlewareEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
