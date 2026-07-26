/**
 * IdentityProviderMapper
 */

export interface IdentityProviderDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface IdentityProviderEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class IdentityProviderMapper {
  toDto(entity: IdentityProviderEntityData): IdentityProviderDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: IdentityProviderDto): IdentityProviderEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: IdentityProviderEntityData[]): IdentityProviderDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: IdentityProviderDto[]): IdentityProviderEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: IdentityProviderEntityData, patch: Partial<IdentityProviderEntityData>): IdentityProviderEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
