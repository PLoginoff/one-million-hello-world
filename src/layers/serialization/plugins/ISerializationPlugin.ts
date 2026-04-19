/**
 * Serialization Plugin Interface
 * 
 * Defines the contract for serialization plugins.
 */

export interface ISerializationPlugin {
  /**
   * Plugin name
   */
  readonly name: string;

  /**
   * Plugin version
   */
  readonly version: string;

  /**
   * Called before serialization
   * 
   * @param data - Data to serialize
   * @returns Modified data or original data
   */
  beforeSerialize?(data: unknown): unknown;

  /**
   * Called after serialization
   * 
   * @param serialized - Serialized data
   * @returns Modified serialized data or original data
   */
  afterSerialize?(serialized: string): string;

  /**
   * Called before deserialization
   * 
   * @param data - Data to deserialize
   * @returns Modified data or original data
   */
  beforeDeserialize?(data: string): string;

  /**
   * Called after deserialization
   * 
   * @param deserialized - Deserialized data
   * @returns Modified data or original data
   */
  afterDeserialize?(deserialized: unknown): unknown;

  /**
   * Initializes the plugin
   */
  initialize?(): Promise<void> | void;

  /**
   * Cleanup the plugin
   */
  cleanup?(): Promise<void> | void;
}
