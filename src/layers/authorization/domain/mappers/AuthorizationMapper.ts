/**
 * AuthorizationMapper
 */

export interface AuthorizationDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface AuthorizationEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AuthorizationMapper {
  toDto(entity: AuthorizationEntityData): AuthorizationDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: AuthorizationDto): AuthorizationEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: AuthorizationEntityData[]): AuthorizationDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: AuthorizationDto[]): AuthorizationEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: AuthorizationEntityData, patch: Partial<AuthorizationEntityData>): AuthorizationEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
