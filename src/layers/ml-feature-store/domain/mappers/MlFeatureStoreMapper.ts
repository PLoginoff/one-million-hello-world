/**
 * MlFeatureStoreMapper
 */

export interface MlFeatureStoreDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface MlFeatureStoreEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MlFeatureStoreMapper {
  toDto(entity: MlFeatureStoreEntityData): MlFeatureStoreDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: MlFeatureStoreDto): MlFeatureStoreEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: MlFeatureStoreEntityData[]): MlFeatureStoreDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: MlFeatureStoreDto[]): MlFeatureStoreEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: MlFeatureStoreEntityData, patch: Partial<MlFeatureStoreEntityData>): MlFeatureStoreEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
