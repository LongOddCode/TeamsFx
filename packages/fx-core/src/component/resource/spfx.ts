// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Action,
  CloudResource,
  ContextV3,
  err,
  FxError,
  InputsWithProjectPath,
  MaybePromise,
  ok,
  Result,
} from "@microsoft/teamsfx-api";
import "reflect-metadata";
import { Service } from "typedi";
import { SPFxPluginImpl } from "../../plugins/resource/spfx/v3/plugin";
import { ComponentNames } from "../constants";

@Service(ComponentNames.SPFx)
export class SpfxResource implements CloudResource {
  readonly name = ComponentNames.SPFx;
  outputs = {};
  finalOutputKeys = [];
  spfxPluginImpl: SPFxPluginImpl = new SPFxPluginImpl();
  deploy(
    context: ContextV3,
    inputs: InputsWithProjectPath
  ): MaybePromise<Result<Action | undefined, FxError>> {
    const action: Action = {
      name: "spfx.deploy",
      type: "function",
      enableTelemetry: true,
      telemetryComponentName: "fx-resource-spfx",
      telemetryEventName: "deploy",
      errorSource: "SPFx",
      plan: (context: ContextV3, inputs: InputsWithProjectPath) => {
        return ok([
          {
            type: "service",
            name: "sharepoint",
            remarks: "deploy spfx",
          },
        ]);
      },
      execute: async (context: ContextV3, inputs: InputsWithProjectPath) => {
        const buildRes = await this.spfxPluginImpl.buildSPPackage(context, inputs);
        if (buildRes.isErr()) {
          return err(buildRes.error);
        }
        const deployRes = await this.spfxPluginImpl.deploy(context, inputs, context.tokenProvider!);
        if (deployRes.isErr()) {
          return err(deployRes.error);
        }
        return ok([
          {
            type: "service",
            name: "sharepoint",
            remarks: "deploy spfx",
          },
        ]);
      },
    };
    return ok(action);
  }
}
