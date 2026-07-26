/**
 * JwtValidationMapper
 */

export interface JwtValidationDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface JwtValidationEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class JwtValidationMapper {
  toDto(entity: JwtValidationEntityData): JwtValidationDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: JwtValidationDto): JwtValidationEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: JwtValidationEntityData[]): JwtValidationDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: JwtValidationDto[]): JwtValidationEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: JwtValidationEntityData, patch: Partial<JwtValidationEntityData>): JwtValidationEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
