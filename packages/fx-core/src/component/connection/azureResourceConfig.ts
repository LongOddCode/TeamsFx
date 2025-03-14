// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Action,
  Bicep,
  CloudResource,
  ContextV3,
  FxError,
  InputsWithProjectPath,
  MaybePromise,
  ok,
  Result,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as path from "path";
import "reflect-metadata";
import { Container } from "typedi";
import { compileHandlebarsTemplateString } from "../../common/tools";
import { getProjectTemplatesFolderPath } from "../../common/utils";
import { getTemplatesFolder } from "../../folder";
import { getComponentByScenario } from "../workflow";

export abstract class AzureResourceConfig {
  abstract readonly name: string;
  abstract readonly bicepModuleName: string;
  abstract readonly requisite: string;
  abstract references: string[];
  templateContext: Record<string, any> = {};
  generateBicep(
    context: ContextV3,
    inputs: InputsWithProjectPath
  ): MaybePromise<Result<Action | undefined, FxError>> {
    const action: Action = {
      name: `${this.name}.generateBicep`,
      type: "function",
      plan: async (context: ContextV3, inputs: InputsWithProjectPath) => {
        const bicep: Bicep = {
          type: "bicep",
          Configuration: {
            Modules: { [`${this.bicepModuleName}Config`]: "1" },
            Orchestration: "1",
          },
        };
        return ok([bicep]);
      },
      execute: async (context: ContextV3, inputs: InputsWithProjectPath) => {
        const update = inputs.update as boolean;
        const requisiteComponent = getComponentByScenario(
          context.projectSetting,
          this.requisite,
          inputs.scenario
        );
        if (!requisiteComponent) return ok([]);
        this.templateContext.connections = requisiteComponent.connections || [];
        for (const refComponentName of this.references) {
          this.templateContext[refComponentName] = { outputs: {} };
          try {
            const refResource = Container.get(refComponentName) as CloudResource;
            if (refResource.outputs) {
              for (const key of Object.keys(refResource.outputs)) {
                const entry = refResource.outputs[key];
                const value = compileHandlebarsTemplateString(entry.bicepVariable ?? "", inputs);
                this.templateContext[refComponentName].outputs[entry.key] = value;
              }
            }
          } catch (e) {}
        }
        this.templateContext.scenario = inputs.scenario || "";
        this.templateContext.scenarioInLowerCase = (inputs.scenario || "").toLowerCase();
        const modulePath = path.join(
          getTemplatesFolder(),
          "bicep",
          `${this.bicepModuleName}.config.module.bicep`
        );
        let module = await fs.readFile(modulePath, "utf-8");
        module = compileHandlebarsTemplateString(module, this.templateContext);
        const templatesFolder = await getProjectTemplatesFolderPath(inputs.projectPath);
        const targetModuleFilePath = path.join(
          templatesFolder,
          "azure",
          "teamsFx",
          `${this.bicepModuleName}${inputs.scenario}Config.bicep`
        );
        const targetModuleFilePathExists = await fs.pathExists(targetModuleFilePath);
        const sourceOrchTemplatePath = path.join(
          getTemplatesFolder(),
          "bicep",
          `${this.bicepModuleName}.config.orchestration.bicep`
        );
        // orchestration part will be added only for first time
        const orch = targetModuleFilePathExists
          ? undefined
          : compileHandlebarsTemplateString(
              await fs.readFile(sourceOrchTemplatePath, "utf-8"),
              this.templateContext
            );
        const moduleName = this.bicepModuleName + (inputs.scenario || "");
        const bicep: Bicep = {
          type: "bicep",
          Configuration: {
            Modules: { [`${moduleName}Config`]: module },
            Orchestration: update ? undefined : orch,
          },
        };
        return ok([bicep]);
      },
    };
    return ok(action);
  }
}
