$body = @{
    email = "teste_$(Get-Random)@normatel.com.br"
    nome = "Usuario Teste Cadastro"
    departamento = "RH"
    cargo = "Colaborador"
} | ConvertTo-Json

Write-Host "Testando novo cadastro..."
Write-Host "Dados: $body"
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/usuarios" `
        -Method POST `
        -Headers @{'Content-Type' = 'application/json'} `
        -Body $body `
        -UseBasicParsing
    
    $conteudo = $response.Content | ConvertFrom-Json
    
    Write-Host "Status HTTP: $($response.StatusCode)"
    Write-Host "ID do usuario: $($conteudo.id)"
    Write-Host "Status: $($conteudo.status)"
    Write-Host "Mensagem: $($conteudo.mensagem)"
    
    if ($conteudo.status -eq 'aprovado') {
        Write-Host ""
        Write-Host "Sucesso! Novo usuario criado e JA APROVADO!"
        Write-Host "Usuario pode fazer login agora!"
    }
} catch {
    Write-Host "Erro: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $content = $reader.ReadToEnd()
        Write-Host "Detalhes: $content"
    }
}
