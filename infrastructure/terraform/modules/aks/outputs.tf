output "cluster_name" {
  value = azurerm_kubernetes_cluster.main.name
}

output "cluster_endpoint" {
  value     = azurerm_kubernetes_cluster.main.fqdn
  sensitive = true
}

output "resource_group_name" {
  value = azurerm_resource_group.main.name
}
