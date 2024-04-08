import express = require('express');

const FS = require('fs');

import { BPMNServer, dateDiff, Behaviour_names   } from '../';
import { BPMNAPI , SecureUser } from '../';
import { Common } from './common';


var caseId = Math.floor(Math.random() * 10000);


const docsFolder = __dirname + '/../bpmnServer/docs/';

// main functions

function awaitAppDelegateFactory (middleware) {
    return async (req, res, next) => {
        try {
/*            if (req.query.userName && typeof (req.query.userName) !=='undefined' && req.query.userName !=='undefined') {
                req.session.userName = req.query.userName;
            }
            else if (!req.session.userName)
                req.session.userName = 'demoUser';
                */

            await middleware(req, res, next)
        } catch (err) {
            next(err)
        }
    }
}
//   
var bpmnServer;
var definitions;
var bpmnAPI;

export class Workflow extends Common {
    config() {
        var router = express.Router();

        bpmnServer = this.webApp.bpmnServer;
        bpmnAPI = new BPMNAPI(bpmnServer);
        definitions = bpmnServer.definitions;

        router.get('/home', home);

        router.get('/', this.isAuthenticated, awaitAppDelegateFactory(async (request, response) => {
            let output = [];
            output = show(output);
		    //console.log("isAuthenticated", request.isAuthenticated(), 'user', request.user);
            
            display(request,response, 'Show', output);
        }));

        router.get('/setUser', this.isAuthenticated, awaitAppDelegateFactory(async (request, response) => {
            let output = [];
            setForUser(request);
            output = show(output);
            //console.log("isAuthenticated", request.isAuthenticated(), 'user', request.user);

            display(request, response, 'Show', output);
        }));
        router.get('/tasks', this.isAuthenticated, awaitAppDelegateFactory(async (request, response) => {
            return await this.tasks(request, response);
        }));


        router.get('/readme_md', awaitAppDelegateFactory(async (request, response) => {

            let processName = request.params.process;
            let fileName = docsFolder + '../README.md';

            let file = FS.readFileSync(fileName,
                { encoding: 'utf8', flag: 'r' });

            response.send(file);

        }));
        router.get('/userName', awaitAppDelegateFactory(async (request, response) => {
            response.send(getUser(request).userName);
        }));
        /*
         *  3 methods for execute:
         *      get: /execute       fires execute without input
         *      get: /executeInput  redirect to executeInput page -> call post: execute
         *      post:/execute       from form with input data
         *      
         */

        router.get('/executeInput/:processName', awaitAppDelegateFactory(async (request, response) => {
            let processName = request.params.processName;

            response.render('executeInput', { processName });
        }));


        router.get('/execute/:processName', awaitAppDelegateFactory(async (request, response) => {

            let processName = request.params.processName;
            request.session.processName = processName;
            let context = await bpmnAPI.engine.start(processName, { caseId: caseId++ },getSecureUser(request));

            if (context.errors) {
                displayError(response, context.errors);
            }


            let execution = context.execution;

            response.redirect('/instanceDetails?id=' + execution.id);
        }));


        router.post('/execute', awaitAppDelegateFactory(async (request, response) => {

            let process = request.body.processName;
            request.session.processName = process;
            let data = {};
            ViewHelper.parseField(request.body.field1, request.body.value1, data);
            ViewHelper.parseField(request.body.field2, request.body.value2, data);


            let startNodeId = request.body.startNodeId


            data['caseId'] = caseId++;

            let context = await bpmnAPI.engine.start(process, data,getSecureUser(request), { startNodeId });
            if (context.errors) {
                displayError(response, context.errors);
            }
            let instance = context.execution;

            response.redirect('/instanceDetails?id=' + instance.id);
        }));
        
        router.post('/execute_only', awaitAppDelegateFactory(async(request, response) => {
            let process = request.body.processName;
            request.session.processName = process;
            let data = request.body.data;
            ViewHelper.parseField(request.body.field1, request.body.value1, data);
            ViewHelper.parseField(request.body.field2, request.body.value2, data);
            let startNodeId = null;
            if ("startNodeId" in request.body) {
                startNodeId = request.body.startNodeId;
            }
            console.log("data: ", data)
            data['caseId'] = caseId++;
            let context = await bpmnServer.engine.start(process, data,getSecureUser(request),  {startNodeId});
            if (context.errors) {
                displayError(response, context.errors);
            }
            let instance = context.execution;
            response.json({instanceId:instance.id});
        }));


        router.get('/listDefinitions', function (req, res) {
            let output = ['Data Reset'];
            output = show(output);
            display(req,res, 'Show', output);

        });

        router.get('/resetData', awaitAppDelegateFactory(async (request, response) => {
            await bpmnServer.dataStore.deleteInstances();
            let output = ['Data Reset'];
            output = show(output);
            display(request,response, 'Show', output);
        }));

        router.get('/refresh', function (req, res) {
            let output = [];
            output = show(output);
            display(req,res, 'Show', output);
        });

        router.get('/clearDebug', function (req, res) {
            //    Logger.clear();
            let output = [];
            output = show(output);
            display(req,res, 'Show', output);
        });

        router.get('/invokeItem', awaitAppDelegateFactory(async (request, response) => {

            let id = request.query.id;
            let processName = request.query.processName;
            let elementId = request.query.elementId;

            const instances = await bpmnAPI.data.findInstances({ "items.id": id }, getSecureUser(request), 'full');
            const instance = instances[0];


            let { node, fields } = await ViewHelper.getNodeInfo(processName, elementId);
            let vars = ViewHelper.formatData(instance.data);

            if (fields && fields.length > 0) {
                response.render('invokeItem', { node,
                    id, fields, processName, elementId ,instance,vars
                });
                return;
            }
            try {
                let result = await bpmnAPI.engine.invoke({ "items.id": id }, {}, getSecureUser(request));

                response.redirect('/instanceDetails?id=' + result.execution.id);
            }
            catch (exc) {
                response.send(exc.toString());
            }
        }));
        router.post('/invokeItem', awaitAppDelegateFactory(async (request, response) => {
            let id = request.body.itemId;
            let data = {};
            
            Object.entries(request.body).forEach(entry => {
               // if (entry[0] == 'itemId') { }
               // else {
                    data[entry[0]] = entry[1];
                //}
            });

            console.log("invokeitem, data: ", data)
            try {
                let instances = await bpmnServer.dataStore.findInstances({"items.id": id}, "summary");                
                console.log(instances.length);
                if (instances.length > 0) {   
                    let instance = instances[0];                 
                    instance.logs = [];
                    instance.data.input = Object.assign({}, data);                  
                    bpmnServer.dataStore.save(instance);                
                }

                let result = await bpmnAPI.engine.invoke({ "items.id": id }, data, getSecureUser(request));

                response.redirect('/instanceDetails?id=' + result.execution.id);
            }
            catch (exc) {
                response.send(exc.toString());
            }

        }));


        router.get('/assign', awaitAppDelegateFactory(async (request, response) => {

            let id = request.query.id;
            let processName = request.query.processName;
            let elementId = request.query.elementId;
            let itemId = request.query.itemId;
            let { node, fields } = await ViewHelper.getNodeInfo(processName, elementId);
            let item = await bpmnAPI.data.findItem({"items.id": id},getSecureUser(request));
            //console.log('item:', item);
            if (!item) {
                request.flash('errors', [{ msg: 'Item not found or not authorized' }]);
                response.redirect('/');
                return;
            }

            const instances = await bpmnAPI.data.findInstances({ "id": item.instanceId }, getSecureUser(request),'full');
            const instance = instances[0];
            const lastItem = instance.items[instance.items.length - 1];

            let vars = ViewHelper.formatData(instance.data);
            response.render('assign', {
                    item, instance, vars, lastItem,
                    dueDate: ViewHelper.dateDisplay(item.dueDate),
                    followUpDate: ViewHelper.dateDisplay(item.followUpDate),
                    id, fields, processName, elementId
                });
            return;
            
        }));

        router.post('/assign', awaitAppDelegateFactory(async (request, response) => {
            let id = request.body.itemId;
            let data = {};
            let assignment = {};

            Object.entries(request.body).forEach(entry => {
                const label = entry[0];
                if (label == 'itemId') { }
                else if (label.startsWith('data_')) {
                    data[label.substr(5)] = entry[1];
                }
                else {
                    //console.log(label, entry[1]);
                    assignment[label] = entry[1];

                }
            });

            try {
                assignment['dueDate'] = ViewHelper.dateInput(assignment['DueDate']);
                assignment['followUpDate'] = ViewHelper.dateInput(assignment['followUpDate']);

                assignment['candidateUsers'] = assignment['candidateUsers'].split(',');
                assignment['candidateGroups'] = assignment['candidateGroups'].split(',');

                //console.log('data', data, 'assignment', assignment);
                let result = await bpmnAPI.engine.assign({ "items.id": id }, data, assignment, getSecureUser(request));

                response.redirect('/instanceDetails?id=' + result.execution.id);
            }
            catch (exc) {
                response.send(exc.toString());
            }

        }));


        router.get('/mocha', awaitAppDelegateFactory(async (request, response) => {

            const mocha = require('../node_modules/mocha/bin/mocha');
        }));

        router.get('/run/:process', awaitAppDelegateFactory(async (request, response) => {
            let process = request.params.process;

            let exec = await bpmnAPI.engine.start(process, { caseId: caseId++ }, getSecureUser(request));
            if (exec.errors) {
                displayError(response, exec.errors);
            }

            let output = ['run ' + process];
            output = show(output);
            display(request,response, 'Run Prcesses', output, exec.instance.logs, exec.instance.items);
        }));
        router.get('/instanceDetails', awaitAppDelegateFactory(async (request, response) => {

            let imageId = request.query.id;
            await instanceDetails(response, imageId);

        }));
        router.get('/instanceDetail', awaitAppDelegateFactory(async(request, response) => {
            let imageId = request.query.id;
            console.log("instanceDetail id: " + imageId);
            await instanceDetail(response, imageId);
        }));
        router.get('/instanceSimple', awaitAppDelegateFactory(async(request, response) =>  {
            let imageId = request.query.id;
            await instanceSimple(response, imageId);
        }));
        router.get('/deleteInstance', deleteInstance);
        router.get('/shutdown', shutdown);
        router.get('/restart', restart);
        router.get('/manage', manage);
        return router;
    }
    async tasks(request, response) {

/*        console.log('request.params', request.params, request.query);

        let forUserEmail = (!('forUserEmail' in request.query)) ? 'User1' : request.query.forUserEmail;
        let forUserGroups = (!('forUserGroups' in request.query)) ? 'group1' : request.query.forUserGroups;
        request.session.forUserEmail = forUserEmail;
        request.session.forUserGroups = forUserGroups;
        console.log('Session:', request.session);
*/

        let items = await bpmnAPI.data.findItems({ "items.type": "bpmn:UserTask", "items.status": "wait" }, getSecureUser(request));

        items.forEach(item => {
            item['fromNow'] = dateDiff(item.startedAt);
            item['dueFrom'] = dateDiff(item.dueDate);
            item['followFrom'] = dateDiff(item.followUpDate);
        });
        let starts = await bpmnAPI.model.findStartEvents({}, getSecureUser(request));


        await response.render('tasks',
            {
                userName: request.session.userName,
                starts: starts,
                debugMsgs: [], // Logger.get(),
                request,
                items: items
            });
        return null;
    }

}


async function home(request, response)  {
        let output = [];
        output = show(output);

        if (request.session.views) {
            request.session.views++
        } else {
            request.session.views = 1
        }
        //console.log('Session:', request.session);



        display(request,response, 'Show', output);
}

async function deleteInstance(req, res) {

    let instanceId = req.query.id;

    await bpmnServer.dataStore.deleteInstances({ id: instanceId });

    let output = ['Complete ' + instanceId];
    display(req,res, 'Show', output);
}
async function shutdown(req, res) {

    let instanceId = req.query.id;

    await bpmnServer.cache.shutdown();

    let output = ['Complete ' + instanceId];
    display(req,res, 'Show', output);
}
async function restart(req, res) {

    let instanceId = req.query.id;

    await bpmnServer.cache.restart();

    let output = ['Complete ' + instanceId];
    display(req,res, 'Show', output);
}
async function getProcs() {
    let list=[];
    let procs=await bpmnServer.definitions.getList();
    procs.forEach(p=>{list.push(p.name);});
    return list;
}
async function manage(req, res) {
    res.render('manageProcesses',
        {
            procs: await getProcs()
        });

}



async function displayError(res, error) {
    let msg = '';

    if (typeof error === 'object') {
        if (error.message) {
//            msg += error.message;
            msg += '<br/>Error Message: ' + error.message;
        }
        if (error.stack) {
            msg += '<br/>Stacktrace:';
            msg += '<br/>====================<br/>';
            msg += error.stack.split('\n').join('<br/>');
        }
    } else {
        msg +=error;
    }
    res.send(msg);

}
function getSecureUser(req) {
//console.log('process.env.REQUIRE_AUTHENTICATION',process.env.REQUIRE_AUTHENTICATION);

    let user;
    if (process.env.REQUIRE_AUTHENTICATION === 'true')
    {
        const usr = getUser(req);
        if (usr)
            user=new SecureUser({ userName: usr.userName, userGroups: usr.userGroups });
    }
    else
         user=SecureUser.SystemUser();
     
    //console.log('getSecureUser',user);
    return user;        
 }

function getUser(req) {
    //console.log('getUser', req.user, req.session.forUser);
    if (req.session.forUser)
        return req.session.forUser;
    else
        return req.user;
}
function setForUser(req) {
    let forUserName;
    let forUserGroups;
    if ('forUserName' in req.query) {
        forUserName = req.query.forUserName;
        forUserGroups = req.query.forUserGroups;

        let userInfo = { userName: forUserName, userGroups: forUserGroups.split(',') };
        req.session.forUser = userInfo;
    }
}


async function display(req,res, title, output, logs = [], items = []) {

    let user = getSecureUser(req);
    var instances = await bpmnAPI.data.findInstances({}, user,'summary');
    let waiting = await bpmnAPI.data.findItems({ "items.status": 'wait', "items.type": 'bpmn:UserTask' }, getSecureUser(req)); 

    waiting.forEach(item => {
        item['fromNow'] = dateDiff(item.startedAt);
    });

    let engines = bpmnServer.cache.list();

    engines.forEach(engine => {
        engine.fromNow = dateDiff(engine.startedAt); 
        engine.fromLast = dateDiff(engine.lastAt); 
        });

    instances.forEach(item => {
        item['fromNow'] = dateDiff(item.startedAt);
        if (item.endedAt)
            item['endFromNow'] = dateDiff(item.endedAt);
        else
            item['endFromNow'] = '';
    });

    res.render('index',
        {
            title: title, output: output,
            engines,
            user,
            procs: await getProcs(),
            debugMsgs: [], // Logger.get(),
            waiting: waiting,
            instances,
            request: req,
            logs, items,
            forUserGroups: req.session.forUserGroups, forUserName: req.session.forUserName
        });

}
function show(output) {
    return output;
}
async function instanceDetail(response, instanceId) {
    await instanceDetailInfo(response, instanceId, "jsondata");
}
async function instanceDetails(response, instanceId) {
    await instanceDetailInfo(response, instanceId, "");
}
async function instanceSimple(response, instanceId) {
    await instanceDetailInfo(response, instanceId, "simple");
}
async function instanceDetailInfo(response, instanceId, mode) { 

    let instance = await bpmnServer.dataStore.findInstance({ id: instanceId }, 'Full');


    let logs = instance.logs;
    let svg = null;
    try {
        svg = await definitions.getSVG(instance.name);

    }
    catch (ex) {

    }

    const lastItem = instance.items[instance.items.length - 1];

    const def = await bpmnServer.definitions.load(instance.name);
    await def.load();
    const defJson = def.getJson();
    let output = ['View Process Log'];
    output = show(output);

    let vars = ViewHelper.formatData(instance.data);

    let decorations = JSON.stringify(ViewHelper.calculateDecorations(instance.items));

    if (mode == "jsondata") {
        response.json({
            instance,
            accessRules: def.accessRules,
            //svg, decorations, definition: defJson,
        });
    }
    else {        
        response.render('InstanceDetails',
        {
            instance, vars,
            accessRules: def.accessRules,
            title: 'Instance Details',
            logs,items: instance.items, svg,
            decorations, definition: defJson, lastItem,
        });
    }
}
export class ViewHelper {

    static dateDisplay(date) {
        if (date)
            return (date).toISOString().split('T')[0];
        else
            return '';

    }
    static dateInput(dateString) {
        if (dateString === '' || dateString=='Invalid Date')
            return null;
        else
            return new Date(dateString);
    }
    static formatData(data) {
        let vars = [];
        Object.keys(data).forEach(function (key) {
            let value = data[key];
            if (Array.isArray(value))
                value = JSON.stringify(value);
            if (typeof value === 'object' && value !== null)
                value = JSON.stringify(value);

            vars.push({ key, value });
        });
        return vars;

    }

    static async getNodeInfo(processName, elementId) {

        let definition = await bpmnServer.definitions.load(processName);
        let node = definition.getNodeById(elementId);
        let extName = Behaviour_names.CamundaFormData;
        let ext = node.getBehaviour(extName);
        let fields;
        if (ext)
            fields = ext.fields;
        return { node, fields };
    }

    static parseField(field, value, data) {
        if (field) {
            if (value.substring(0, 1) == '[') {
                value = value.substring(1);
                value = value.substring(0, value.length - 1);
                let array = value.split(',');
                value = array;
            }
            data[field] = value;
        }
    }
    static calculateDecorations(items) {
        let decors = [];
        let seq = 1;
        items.forEach(item => {
            let color = 'red';
            if (item.status == 'end') {
                if (item.endedAt == null && item.type != 'bpmn:SequenceFlow')
                    color = 'gray';
                else
                    color = 'black';
            }
            let decor = { id: item.elementId, color, seq };
            decors.push(decor);
            seq++;
        });
        return decors;
    }
}
//export default router;
