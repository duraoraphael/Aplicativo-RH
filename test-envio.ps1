$body = @{
    nome = "Teste Envio"
    funcao = "Desenvolvedor"
    projeto = "736"
    tipo_atestado = "Médico"
    data_inicio = "2026-03-01"
    data_fim = "2026-03-02"
    dias = 1
} | ConvertTo-Json

Write-Host "Enviando atestado de teste..."
Write-Host "Dados: $body"

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/envios" `
        -Method POST `
        -Headers @{'Content-Type' = 'application/json'} `
        -Body $body `
        -UseBasicParsing
    
    Write-Host "`nStatus Code: $($response.StatusCode)"
    Write-Host "Resposta: $($response.Content)"
    Write-Host "`n✅ Sucesso! Atestado enviado."
} catch {
    Write-Host "❌ Erro: $($_.Exception.Message)"
    Write-Host "Status: $($_.Exception.Response.StatusCode.Value)"
    if ($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $content = $reader.ReadToEnd()
        Write-Host "Detalhes: $content"
    }
}
