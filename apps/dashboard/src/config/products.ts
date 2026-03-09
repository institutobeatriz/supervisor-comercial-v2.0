export interface ProductConfig {
  name: string
  emoji: string
  color: string
  colorHex: string
  description: string
}

// Edite aqui para adicionar/renomear produtos/instâncias
export const PRODUCTS: Record<string, ProductConfig> = {
  all: {
    name: 'Todos os Produtos',
    emoji: '📊',
    color: 'text-gray-300',
    colorHex: '#6366f1',
    description: 'Visão consolidada',
  },
  '80a50431-8f36-477c-9072-f0adcba3696e': {
    name: 'Vendedor Padrão',
    emoji: '🏷️',
    color: 'text-accent-primary',
    colorHex: '#6366f1',
    description: 'Instância principal',
  },
  '6f875432-5dea-4fcf-972e-b278eb2c1d5b': {
    name: 'Instituto-Vendas',
    emoji: '🎓',
    color: 'text-emerald-400',
    colorHex: '#10b981',
    description: 'Cursos e treinamentos',
  },
}
