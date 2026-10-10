STATUS / ARQUIVOS / RESUMO (max 10 linhas)

[ARQUIVOS]
- Producao (docker): md5=26b00634c215b280b70e5ff4790bc2bfab53175484b015f1f20eec21f574a311
- Working dir: md5=a1d3cb99d6be2cbafc7366b8e26cb632 (modificado, nao commiteado)
- HEAD commit: md5=2c53049189711fa9a5225551045c2db1 (ultimo public)
- dd5471e (28/09): md5 igual a HEAD, "refino completo + pipeline online"
- Backup 23/09: md5=d406e6b64f8ddb2cce2e514e8510a1c6 (278.7K, legado)

[GLB METADADAS (todos os versoes)]
- 1 mesh, 67 nodes, 1 skin, 2 animations (Walk/Idle), 65 joints
- Extras: walkSpeed=1.684, walkAdvance=0.96
- Nodes sem "Bone" no nome; skeleton indexado via skin joints

[CONCLUSAO EM 3 LINHAS]
- GLB producao md5 26b00634... DIFERENTE de HEAD (2c53049...) e do working dir (a1d3cb9...).
- Git HEAD tem o modelo v13 aprovado em 25/09 (commit d622733 "walking v13", de 25/09).
- O que esta em producao e (c) outro — build publicado separado, nao o hi3d de 01/10 nem o v13 HEAD.

[PROBLEMAS]
- Working dir tem versao modificada nao commiteada de ana_coriza.glb.
- Producao tem build com md5 diferente dos dois; necessario verificar origem e se deve ser v13 ou outro.
- Animacoes Walk/Idle presentes em todas; validar duracao e criteria de walk.

[PROXIMO]
- Identificar qual commit/tag gerou o build producao (md5 26b00634...).
- Decidir se promover HEAD v13 (d622733 de 25/09) ou o modelo hi3d de 01/10 para producao.
- Verificar diferencas de clips/bones entre versoes se necessario para criteria de walk.