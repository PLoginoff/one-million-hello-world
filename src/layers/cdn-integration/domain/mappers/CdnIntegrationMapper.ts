/**
 * CdnIntegrationMapper
 */

export interface CdnIntegrationDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface CdnIntegrationEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CdnIntegrationMapper {
  toDto(entity: CdnIntegrationEntityData): CdnIntegrationDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: CdnIntegrationDto): CdnIntegrationEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: CdnIntegrationEntityData[]): CdnIntegrationDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: CdnIntegrationDto[]): CdnIntegrationEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: CdnIntegrationEntityData, patch: Partial<CdnIntegrationEntityData>): CdnIntegrationEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
