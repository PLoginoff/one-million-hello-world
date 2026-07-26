/**
 * GovernanceMapper
 */

export interface GovernanceDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface GovernanceEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class GovernanceMapper {
  toDto(entity: GovernanceEntityData): GovernanceDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: GovernanceDto): GovernanceEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: GovernanceEntityData[]): GovernanceDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: GovernanceDto[]): GovernanceEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: GovernanceEntityData, patch: Partial<GovernanceEntityData>): GovernanceEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
